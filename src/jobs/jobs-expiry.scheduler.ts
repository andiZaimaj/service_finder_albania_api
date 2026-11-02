import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { JobStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class JobsExpiryScheduler {
  private readonly logger = new Logger(JobsExpiryScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleExpiredJobs(): Promise<void> {
    const now = new Date();
    const expired = await this.prisma.jobPost.findMany({
      where: {
        status: JobStatus.OPEN,
        expiresAt: { lt: now },
      },
    });
    for (const job of expired) {
      await this.prisma.jobPost.update({
        where: { id: job.id },
        data: { status: JobStatus.EXPIRED },
      });
      await this.notifications.createNotification(
        job.clientId,
        'JOB_EXPIRED',
        'Job post expired',
        `Your job "${job.title}" has expired and is no longer visible to workers.`,
      );
    }
    if (expired.length) {
      this.logger.log(`Marked ${expired.length} job(s) as EXPIRED`);
    }
  }
}
