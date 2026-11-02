import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { JobStatus, Prisma, SubscriptionTier, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateJobDto } from './dto/create-job.dto';
import { UpdateJobDto } from './dto/update-job.dto';
import { ListJobsQueryDto } from './dto/list-jobs-query.dto';
import { ListMyJobsQueryDto } from './dto/list-my-jobs-query.dto';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/** Keeps one client from flooding the worker feed with open posts. */
export const MAX_OPEN_JOBS_PER_CLIENT = 10;

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(clientId: string, dto: CreateJobDto) {
    const category = await this.prisma.category.findUnique({
      where: { id: dto.categoryId },
      select: { id: true },
    });
    if (!category) {
      throw new BadRequestException('Category not found');
    }

    const openJobs = await this.prisma.jobPost.count({
      where: { clientId, status: JobStatus.OPEN },
    });
    if (openJobs >= MAX_OPEN_JOBS_PER_CLIENT) {
      throw new BadRequestException(
        `You already have ${MAX_OPEN_JOBS_PER_CLIENT} open job posts. Close one before posting another.`,
      );
    }

    const city = dto.city.trim();
    const job = await this.prisma.jobPost.create({
      data: {
        clientId,
        title: dto.title,
        description: dto.description,
        categoryId: dto.categoryId,
        city,
        address: dto.address,
        expiresAt: new Date(Date.now() + THIRTY_DAYS_MS),
        status: JobStatus.OPEN,
      },
      include: { category: true },
    });

    await this.notifyMatchingWorkers(job);
    return job;
  }

  /**
   * Alerts the workers whose profile covers both the job's category and city.
   * Only BASIC/PRO workers are notified — they are the only ones allowed to
   * open the listing and submit a proposal.
   *
   * A failure here must not fail the post: the job is already saved, and the
   * client would otherwise see a 500 for a request that succeeded.
   */
  private async notifyMatchingWorkers(job: {
    title: string;
    city: string;
    categoryId: string;
  }): Promise<void> {
    try {
      const matches = await this.prisma.workerProfile.findMany({
        where: {
          subscriptionTier: {
            in: [SubscriptionTier.BASIC, SubscriptionTier.PRO],
          },
          categories: { some: { categoryId: job.categoryId } },
          cities: { some: { city: { equals: job.city, mode: 'insensitive' } } },
        },
        select: { userId: true },
      });
      if (!matches.length) {
        return;
      }
      await this.notifications.createManyNotifications(
        matches.map((m) => ({
          userId: m.userId,
          type: 'NEW_JOB',
          title: 'New job in your area',
          body: `"${job.title}" was posted in ${job.city}.`,
        })),
      );
    } catch (e: unknown) {
      this.logger.warn(
        `Could not notify workers about job in ${job.city}: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
  }

  /** The client's own job posts — their dashboard for everything they created. */
  async listForClient(clientId: string, query: ListMyJobsQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.JobPostWhereInput = { clientId };
    if (query.status) {
      where.status = query.status;
    }

    const [items, total] = await Promise.all([
      this.prisma.jobPost.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          category: true,
          _count: { select: { proposals: true } },
        },
      }),
      this.prisma.jobPost.count({ where }),
    ]);

    return {
      items: items.map(({ _count, ...job }) => ({
        ...job,
        proposalCount: _count.proposals,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  async listOpen(_user: JwtPayload, query: ListJobsQueryDto) {
    const where: {
      status: JobStatus;
      categoryId?: string;
      city?: { equals: string; mode: 'insensitive' };
    } = {
      status: JobStatus.OPEN,
    };
    if (query.categoryId) {
      where.categoryId = query.categoryId;
    }
    if (query.city) {
      where.city = { equals: query.city, mode: 'insensitive' };
    }
    return this.prisma.jobPost.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { category: true },
    });
  }

  async findOne(jobId: string, user: JwtPayload) {
    const job = await this.prisma.jobPost.findUnique({
      where: { id: jobId },
      include: {
        category: true,
        client: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
          },
        },
        proposals: {
          include: {
            workerProfile: {
              include: {
                user: {
                  select: {
                    firstName: true,
                    lastName: true,
                    avatarUrl: true,
                  },
                },
                cities: true,
              },
            },
          },
        },
      },
    });
    if (!job) {
      throw new NotFoundException('Job not found');
    }

    if (user.role === UserRole.CLIENT) {
      if (job.clientId !== user.sub) {
        throw new ForbiddenException();
      }
      return job;
    }

    if (user.role === UserRole.WORKER) {
      const profile = await this.prisma.workerProfile.findUnique({
        where: { userId: user.sub },
      });
      if (!profile) {
        throw new ForbiddenException();
      }
      const own = job.proposals.filter((p) => p.workerProfileId === profile.id);
      return {
        ...job,
        proposals: own,
      };
    }

    if (user.role === UserRole.ADMIN) {
      return job;
    }

    throw new ForbiddenException();
  }

  async updateJob(jobId: string, clientId: string, dto: UpdateJobDto) {
    const job = await this.prisma.jobPost.findUnique({ where: { id: jobId } });
    if (!job || job.clientId !== clientId) {
      throw new NotFoundException('Job not found');
    }
    return this.prisma.jobPost.update({
      where: { id: jobId },
      data: {
        title: dto.title,
        description: dto.description,
        city: dto.city,
        expiresAt: dto.expiresAt,
      },
      include: { category: true },
    });
  }

  async closeJob(jobId: string, clientId: string) {
    const job = await this.prisma.jobPost.findUnique({ where: { id: jobId } });
    if (!job || job.clientId !== clientId) {
      throw new NotFoundException('Job not found');
    }
    return this.prisma.jobPost.update({
      where: { id: jobId },
      data: { status: JobStatus.CLOSED },
    });
  }

  async deleteJob(jobId: string, clientId: string) {
    const job = await this.prisma.jobPost.findUnique({ where: { id: jobId } });
    if (!job || job.clientId !== clientId) {
      throw new NotFoundException('Job not found');
    }
    if (job.status !== JobStatus.OPEN) {
      throw new BadRequestException('Only OPEN jobs can be deleted');
    }
    await this.prisma.jobPost.delete({ where: { id: jobId } });
    return { deleted: true };
  }
}
