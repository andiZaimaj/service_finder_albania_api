import { config } from 'dotenv';
import { resolve } from 'path';
import * as bcrypt from 'bcrypt';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import {
  PrismaClient,
  UserRole,
  WorkerType,
  SubscriptionTier,
  SubscriptionStatus,
  JobStatus,
  ProposalStatus,
} from '@prisma/client';
import { Prisma } from '@prisma/client';

config({ path: resolve(__dirname, '../.env') });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set (check .env)');
}
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const passwordHash = await bcrypt.hash('Password123!', 10);

  const categories = await Promise.all([
    prisma.category.upsert({
      where: { slug: 'electrician' },
      update: {},
      create: {
        name: 'Electrician',
        slug: 'electrician',
      },
    }),
    prisma.category.upsert({
      where: { slug: 'plumber' },
      update: {},
      create: { name: 'Plumber', slug: 'plumber' },
    }),
    prisma.category.upsert({
      where: { slug: 'cleaner' },
      update: {},
      create: { name: 'Cleaner', slug: 'cleaner' },
    }),
    prisma.category.upsert({
      where: { slug: 'mechanic' },
      update: {},
      create: { name: 'Mechanic', slug: 'mechanic' },
    }),
    prisma.category.upsert({
      where: { slug: 'painter' },
      update: {},
      create: { name: 'Painter', slug: 'painter' },
    }),
  ]);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: {
      email: 'admin@example.com',
      passwordHash,
      role: UserRole.ADMIN,
      firstName: 'Admin',
      lastName: 'User',
    },
  });

  const workerBasicUser = await prisma.user.upsert({
    where: { email: 'worker.basic@example.com' },
    update: {},
    create: {
      email: 'worker.basic@example.com',
      passwordHash,
      role: UserRole.WORKER,
      firstName: 'Ben',
      lastName: 'Basic',
    },
  });

  const workerProUser = await prisma.user.upsert({
    where: { email: 'worker.pro@example.com' },
    update: {},
    create: {
      email: 'worker.pro@example.com',
      passwordHash,
      role: UserRole.WORKER,
      firstName: 'Paul',
      lastName: 'Pro',
    },
  });

  const client1 = await prisma.user.upsert({
    where: { email: 'client1@example.com' },
    update: {},
    create: {
      email: 'client1@example.com',
      passwordHash,
      role: UserRole.CLIENT,
      firstName: 'Clara',
      lastName: 'Client',
    },
  });

  const client2 = await prisma.user.upsert({
    where: { email: 'client2@example.com' },
    update: {},
    create: {
      email: 'client2@example.com',
      passwordHash,
      role: UserRole.CLIENT,
      firstName: 'Chris',
      lastName: 'Customer',
    },
  });

  const workerBasic = await prisma.workerProfile.upsert({
    where: { userId: workerBasicUser.id },
    update: {},
    create: {
      userId: workerBasicUser.id,
      type: WorkerType.SOLE_TRADER,
      bio: 'Experienced tradesperson (BASIC plan).',
      subscriptionTier: SubscriptionTier.BASIC,
      subscriptionStatus: SubscriptionStatus.ACTIVE,
    },
  });

  const workerPro = await prisma.workerProfile.upsert({
    where: { userId: workerProUser.id },
    update: {},
    create: {
      userId: workerProUser.id,
      type: WorkerType.COMPANY,
      businessName: 'Pro Services SHPK',
      bio: 'Premium services (PRO plan).',
      subscriptionTier: SubscriptionTier.PRO,
      subscriptionStatus: SubscriptionStatus.ACTIVE,
    },
  });

  await prisma.workerCity.deleteMany({
    where: {
      workerProfileId: { in: [workerBasic.id, workerPro.id] },
    },
  });
  await prisma.workerCity.createMany({
    data: [
      { workerProfileId: workerBasic.id, city: 'Tirana' },
      { workerProfileId: workerBasic.id, city: 'Durrës' },
      { workerProfileId: workerPro.id, city: 'Tirana' },
    ],
  });

  await prisma.workerCategory.deleteMany({
    where: {
      workerProfileId: { in: [workerBasic.id, workerPro.id] },
    },
  });
  await prisma.workerCategory.createMany({
    data: [
      {
        workerProfileId: workerBasic.id,
        categoryId: categories[0].id,
      },
      {
        workerProfileId: workerBasic.id,
        categoryId: categories[1].id,
      },
      {
        workerProfileId: workerPro.id,
        categoryId: categories[0].id,
      },
      {
        workerProfileId: workerPro.id,
        categoryId: categories[4].id,
      },
    ],
  });

  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  let job1 = await prisma.jobPost.findFirst({
    where: { title: 'Fix kitchen wiring', clientId: client1.id },
  });
  if (!job1) {
    job1 = await prisma.jobPost.create({
      data: {
        clientId: client1.id,
        title: 'Fix kitchen wiring',
        description: 'Need certified electrician for partial rewiring in Tirana.',
        categoryId: categories[0].id,
        city: 'Tirana',
        address: 'Rruga e Durrësit',
        status: JobStatus.OPEN,
        expiresAt,
      },
    });
  }

  let job2 = await prisma.jobPost.findFirst({
    where: { title: 'Paint apartment', clientId: client2.id },
  });
  if (!job2) {
    job2 = await prisma.jobPost.create({
      data: {
        clientId: client2.id,
        title: 'Paint apartment',
        description: 'Two-room apartment needs painting before move-in.',
        categoryId: categories[4].id,
        city: 'Tirana',
        status: JobStatus.OPEN,
        expiresAt,
      },
    });
  }

  const p1 = await prisma.jobProposal.findFirst({
    where: {
      jobPostId: job1.id,
      workerProfileId: workerBasic.id,
    },
  });
  if (!p1) {
    await prisma.jobProposal.createMany({
      data: [
        {
          jobPostId: job1.id,
          workerProfileId: workerBasic.id,
          message: 'I can inspect and quote this week.',
          priceEstimate: new Prisma.Decimal(250),
          status: ProposalStatus.PENDING,
        },
        {
          jobPostId: job1.id,
          workerProfileId: workerPro.id,
          message: 'Our team handles full electrical jobs.',
          priceEstimate: new Prisma.Decimal(320),
          status: ProposalStatus.PENDING,
        },
      ],
    });
  }

  const p2 = await prisma.jobProposal.findFirst({
    where: { jobPostId: job2.id, workerProfileId: workerPro.id },
  });
  if (!p2) {
    await prisma.jobProposal.create({
      data: {
        jobPostId: job2.id,
        workerProfileId: workerPro.id,
        message: 'We can start next Monday.',
        priceEstimate: new Prisma.Decimal(450),
        status: ProposalStatus.PENDING,
      },
    });
  }

  console.log('Seed completed.', {
    admin: admin.email,
    categories: categories.map((c) => c.slug),
    jobs: [job1.id, job2.id],
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
