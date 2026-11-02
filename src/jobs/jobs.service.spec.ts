import { BadRequestException } from '@nestjs/common';
import { JobStatus, SubscriptionTier } from '@prisma/client';
import { JobsService, MAX_OPEN_JOBS_PER_CLIENT } from './jobs.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateJobDto } from './dto/create-job.dto';

const CLIENT_ID = 'client-1';
const CATEGORY_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

type PrismaArgs = Record<string, unknown>;

/** First argument the mock was called with, typed so lint stays happy. */
function firstArg(mock: jest.Mock): PrismaArgs {
  return (mock.mock.calls as PrismaArgs[][])[0][0];
}

function createdJobData(mock: jest.Mock): PrismaArgs {
  return firstArg(mock).data as PrismaArgs;
}

function buildDto(overrides: Partial<CreateJobDto> = {}): CreateJobDto {
  return {
    title: 'Fix the kitchen sink',
    description: 'The sink leaks under the cabinet and needs a new siphon.',
    categoryId: CATEGORY_ID,
    city: 'Tirana',
    ...overrides,
  };
}

describe('JobsService', () => {
  let service: JobsService;
  let prisma: {
    category: { findUnique: jest.Mock };
    jobPost: { count: jest.Mock; create: jest.Mock; findMany: jest.Mock };
    workerProfile: { findMany: jest.Mock };
  };
  let notifications: { createManyNotifications: jest.Mock };

  beforeEach(() => {
    prisma = {
      category: { findUnique: jest.fn() },
      jobPost: { count: jest.fn(), create: jest.fn(), findMany: jest.fn() },
      workerProfile: { findMany: jest.fn() },
    };
    notifications = { createManyNotifications: jest.fn() };

    prisma.category.findUnique.mockResolvedValue({ id: CATEGORY_ID });
    prisma.jobPost.count.mockResolvedValue(0);
    prisma.jobPost.create.mockImplementation((args: { data: PrismaArgs }) =>
      Promise.resolve({ id: 'job-1', ...args.data }),
    );
    prisma.workerProfile.findMany.mockResolvedValue([]);
    notifications.createManyNotifications.mockResolvedValue({ count: 0 });

    service = new JobsService(
      prisma as unknown as PrismaService,
      notifications as unknown as NotificationsService,
    );
  });

  describe('create', () => {
    it('rejects a category that does not exist instead of failing on the FK', async () => {
      prisma.category.findUnique.mockResolvedValue(null);

      await expect(
        service.create(CLIENT_ID, buildDto()),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.jobPost.create).not.toHaveBeenCalled();
    });

    it('rejects a new post once the client hits the open-job cap', async () => {
      prisma.jobPost.count.mockResolvedValue(MAX_OPEN_JOBS_PER_CLIENT);

      await expect(
        service.create(CLIENT_ID, buildDto()),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.jobPost.count).toHaveBeenCalledWith({
        where: { clientId: CLIENT_ID, status: JobStatus.OPEN },
      });
      expect(prisma.jobPost.create).not.toHaveBeenCalled();
    });

    it('creates an OPEN job owned by the client that expires in 30 days', async () => {
      const before = Date.now();

      const job = await service.create(CLIENT_ID, buildDto());

      const data = createdJobData(prisma.jobPost.create);
      expect(data.clientId).toBe(CLIENT_ID);
      expect(data.status).toBe(JobStatus.OPEN);
      expect((data.expiresAt as Date).getTime()).toBeGreaterThanOrEqual(
        before + 29 * 24 * 60 * 60 * 1000,
      );
      expect(job).toMatchObject({ id: 'job-1', title: 'Fix the kitchen sink' });
    });

    it('trims the city so worker matching is not broken by stray whitespace', async () => {
      await service.create(CLIENT_ID, buildDto({ city: '  Tirana  ' }));

      expect(createdJobData(prisma.jobPost.create).city).toBe('Tirana');
    });

    it('notifies paid workers covering the job category and city', async () => {
      prisma.workerProfile.findMany.mockResolvedValue([
        { userId: 'worker-1' },
        { userId: 'worker-2' },
      ]);

      await service.create(CLIENT_ID, buildDto());

      const where = firstArg(prisma.workerProfile.findMany).where as PrismaArgs;
      expect(where.subscriptionTier).toEqual({
        in: [SubscriptionTier.BASIC, SubscriptionTier.PRO],
      });
      expect(where.categories).toEqual({ some: { categoryId: CATEGORY_ID } });
      expect(where.cities).toEqual({
        some: { city: { equals: 'Tirana', mode: 'insensitive' } },
      });

      expect(notifications.createManyNotifications).toHaveBeenCalledWith([
        expect.objectContaining({ userId: 'worker-1', type: 'NEW_JOB' }),
        expect.objectContaining({ userId: 'worker-2', type: 'NEW_JOB' }),
      ]);
    });

    it('skips the fan-out when no worker matches', async () => {
      await service.create(CLIENT_ID, buildDto());

      expect(notifications.createManyNotifications).not.toHaveBeenCalled();
    });

    it('still returns the created job when the fan-out fails', async () => {
      prisma.workerProfile.findMany.mockRejectedValue(new Error('db down'));

      await expect(
        service.create(CLIENT_ID, buildDto()),
      ).resolves.toMatchObject({ id: 'job-1' });
    });
  });

  describe('listForClient', () => {
    beforeEach(() => {
      prisma.jobPost.findMany.mockResolvedValue([
        {
          id: 'job-1',
          title: 'Fix the kitchen sink',
          status: JobStatus.OPEN,
          _count: { proposals: 3 },
        },
      ]);
      prisma.jobPost.count.mockResolvedValue(1);
    });

    it('returns only the requesting client jobs with proposal counts', async () => {
      const result = await service.listForClient(CLIENT_ID, {});

      expect(firstArg(prisma.jobPost.findMany)).toMatchObject({
        where: { clientId: CLIENT_ID },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 20,
      });
      expect(result.items[0]).toMatchObject({ id: 'job-1', proposalCount: 3 });
      expect(result.items[0]).not.toHaveProperty('_count');
      expect(result).toMatchObject({
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
    });

    it('filters by status when asked', async () => {
      await service.listForClient(CLIENT_ID, { status: JobStatus.CLOSED });

      expect(firstArg(prisma.jobPost.findMany)).toMatchObject({
        where: { clientId: CLIENT_ID, status: JobStatus.CLOSED },
      });
    });

    it('applies pagination offsets', async () => {
      await service.listForClient(CLIENT_ID, { page: 3, limit: 5 });

      expect(firstArg(prisma.jobPost.findMany)).toMatchObject({
        skip: 10,
        take: 5,
      });
    });
  });
});
