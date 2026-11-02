import { Module } from '@nestjs/common';
import { JobsService } from './jobs.service';
import { JobsController } from './jobs.controller';
import { JobsExpiryScheduler } from './jobs-expiry.scheduler';
import { ProposalsModule } from '../proposals/proposals.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaidWorkerOrAdminGuard } from '../common/guards/paid-worker-or-admin.guard';

@Module({
  imports: [ProposalsModule, NotificationsModule],
  controllers: [JobsController],
  providers: [JobsService, JobsExpiryScheduler, PaidWorkerOrAdminGuard],
  exports: [JobsService],
})
export class JobsModule {}
