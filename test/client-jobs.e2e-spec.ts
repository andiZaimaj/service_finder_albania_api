import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { JobStatus, UserRole } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { HttpExceptionFilter } from './../src/common/filters/http-exception.filter';
import { TransformInterceptor } from './../src/common/interceptors/transform.interceptor';
import { PrismaService } from './../src/prisma/prisma.service';

process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret';
const JWT_SECRET = process.env.JWT_SECRET;

const CATEGORY_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

/** The envelope TransformInterceptor / HttpExceptionFilter wrap every reply in. */
interface ApiBody<T> {
  data: T;
  message: string | string[];
  statusCode: number;
}

function body<T>(res: { body: unknown }): ApiBody<T> {
  return res.body as ApiBody<T>;
}

const CLIENT = {
  id: 'client-1',
  email: 'client@example.com',
  role: UserRole.CLIENT,
  isActive: true,
};
const WORKER = {
  id: 'worker-1',
  email: 'worker@example.com',
  role: UserRole.WORKER,
  isActive: true,
};

describe('Client job posting (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: {
    user: { findUnique: jest.Mock };
    category: { findMany: jest.Mock; findUnique: jest.Mock };
    jobPost: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
    };
    workerProfile: { findMany: jest.Mock };
  };

  const tokenFor = (user: { id: string; email: string; role: UserRole }) =>
    new JwtService({ secret: JWT_SECRET }).sign(
      { sub: user.id, email: user.email, role: user.role },
      { expiresIn: '15m' },
    );

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn() },
      category: { findMany: jest.fn(), findUnique: jest.fn() },
      jobPost: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
      },
      workerProfile: { findMany: jest.fn() },
    };

    prisma.user.findUnique.mockImplementation(
      ({ where }: { where: { id: string } }) =>
        Promise.resolve(
          where.id === CLIENT.id
            ? CLIENT
            : where.id === WORKER.id
              ? WORKER
              : null,
        ),
    );
    prisma.category.findMany.mockResolvedValue([
      { id: CATEGORY_ID, name: 'Plumbing', slug: 'plumbing', iconUrl: null },
    ]);
    prisma.jobPost.findMany.mockResolvedValue([]);
    prisma.jobPost.count.mockResolvedValue(0);
    prisma.workerProfile.findMany.mockResolvedValue([]);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        ...prisma,
        onModuleInit: () => Promise.resolve(),
        onModuleDestroy: () => Promise.resolve(),
        $connect: () => Promise.resolve(),
        $disconnect: () => Promise.resolve(),
      })
      .compile();

    app = moduleFixture.createNestApplication({ rawBody: true });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('serves categories without a token so the post-a-job form can load', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/categories')
      .expect(200);

    expect(body<unknown[]>(res).data).toEqual([
      { id: CATEGORY_ID, name: 'Plumbing', slug: 'plumbing', iconUrl: null },
    ]);
  });

  it('routes /jobs/mine to the client list, not to the :id lookup', async () => {
    prisma.jobPost.findMany.mockResolvedValue([
      {
        id: 'job-1',
        title: 'Fix the kitchen sink',
        status: JobStatus.OPEN,
        _count: { proposals: 2 },
      },
    ]);
    prisma.jobPost.count.mockResolvedValue(1);

    const res = await request(app.getHttpServer())
      .get('/api/jobs/mine')
      .set('Authorization', `Bearer ${tokenFor(CLIENT)}`)
      .expect(200);

    // If ':id' had shadowed 'mine', findOne would have run a findUnique instead.
    expect(prisma.jobPost.findUnique).not.toHaveBeenCalled();
    const page = body<{ items: unknown[]; total: number }>(res).data;
    expect(page.items).toEqual([
      expect.objectContaining({ id: 'job-1', proposalCount: 2 }),
    ]);
    expect(page.total).toBe(1);
  });

  it('scopes /jobs/mine to the caller', async () => {
    await request(app.getHttpServer())
      .get('/api/jobs/mine')
      .set('Authorization', `Bearer ${tokenFor(CLIENT)}`)
      .expect(200);

    const args = (
      prisma.jobPost.findMany.mock.calls as { where: { clientId: string } }[][]
    )[0][0];
    expect(args.where.clientId).toBe(CLIENT.id);
  });

  it('keeps workers out of the client job list', async () => {
    await request(app.getHttpServer())
      .get('/api/jobs/mine')
      .set('Authorization', `Bearer ${tokenFor(WORKER)}`)
      .expect(403);
  });

  it('rejects an unknown category with 400 rather than a Prisma 500', async () => {
    prisma.category.findUnique.mockResolvedValue(null);

    const res = await request(app.getHttpServer())
      .post('/api/jobs')
      .set('Authorization', `Bearer ${tokenFor(CLIENT)}`)
      .send({
        title: 'Fix the kitchen sink',
        description: 'The sink leaks under the cabinet.',
        categoryId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
        city: 'Tirana',
      })
      .expect(400);

    expect(body(res).message).toBe('Category not found');
    expect(prisma.jobPost.create).not.toHaveBeenCalled();
  });

  it('lets a client post a job and notifies matching workers', async () => {
    prisma.category.findUnique.mockResolvedValue({ id: CATEGORY_ID });
    prisma.jobPost.create.mockResolvedValue({
      id: 'job-9',
      title: 'Fix the kitchen sink',
      city: 'Tirana',
      categoryId: CATEGORY_ID,
    });

    const res = await request(app.getHttpServer())
      .post('/api/jobs')
      .set('Authorization', `Bearer ${tokenFor(CLIENT)}`)
      .send({
        title: 'Fix the kitchen sink',
        description: 'The sink leaks under the cabinet.',
        categoryId: CATEGORY_ID,
        city: 'Tirana',
      })
      .expect(201);

    expect(body<{ id: string }>(res).data).toMatchObject({ id: 'job-9' });
    expect(prisma.workerProfile.findMany).toHaveBeenCalled();
  });

  it('does not let a worker post a job', async () => {
    await request(app.getHttpServer())
      .post('/api/jobs')
      .set('Authorization', `Bearer ${tokenFor(WORKER)}`)
      .send({
        title: 'Fix the kitchen sink',
        description: 'The sink leaks under the cabinet.',
        categoryId: CATEGORY_ID,
        city: 'Tirana',
      })
      .expect(403);
  });
});
