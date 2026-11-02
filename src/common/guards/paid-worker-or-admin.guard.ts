import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { UserRole, SubscriptionTier } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';

/** Allows ADMIN or WORKER with BASIC or PRO subscription (paid marketplace access). */
@Injectable()
export class PaidWorkerOrAdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{ user: JwtPayload }>();
    const user = req.user;
    if (!user) {
      throw new ForbiddenException();
    }
    if (user.role === UserRole.ADMIN) {
      return true;
    }
    if (user.role !== UserRole.WORKER) {
      throw new ForbiddenException('Only workers with a paid plan or admins');
    }
    const profile = await this.prisma.workerProfile.findUnique({
      where: { userId: user.sub },
    });
    if (
      !profile ||
      (profile.subscriptionTier !== SubscriptionTier.BASIC &&
        profile.subscriptionTier !== SubscriptionTier.PRO)
    ) {
      throw new ForbiddenException('Active BASIC or PRO subscription required');
    }
    return true;
  }
}
