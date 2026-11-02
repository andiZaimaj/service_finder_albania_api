import { Injectable, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WorkersService } from '../workers/workers.service';
import { AdminListUsersQueryDto } from './dto/list-users-query.dto';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workersService: WorkersService,
  ) {}

  async listUsers(query: AdminListUsersQueryDto) {
    return this.prisma.user.findMany({
      where: {
        role: query.role,
        email: query.email
          ? { contains: query.email, mode: 'insensitive' }
          : undefined,
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        role: true,
        firstName: true,
        lastName: true,
        phone: true,
        avatarUrl: true,
        isVerified: true,
        isActive: true,
        createdAt: true,
      },
    });
  }

  async deactivateUser(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u) {
      throw new NotFoundException('User not found');
    }
    return this.prisma.user.update({
      where: { id: userId },
      data: { isActive: false },
    });
  }

  async verifyWorkerId(userId: string) {
    const profile = await this.prisma.workerProfile.findUnique({
      where: { userId },
    });
    if (!profile) {
      throw new NotFoundException('Worker profile not found');
    }
    return this.prisma.workerProfile.update({
      where: { id: profile.id },
      data: { isIdVerified: true },
    });
  }

  async listJobs() {
    return this.prisma.jobPost.findMany({
      orderBy: { createdAt: 'desc' },
      include: { category: true, client: { select: { email: true, firstName: true } } },
    });
  }

  async deleteJob(jobId: string) {
    await this.prisma.jobPost.delete({ where: { id: jobId } });
    return { deleted: true };
  }

  async listReviews() {
    return this.prisma.review.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        client: { select: { email: true, firstName: true } },
        workerProfile: {
          include: {
            user: { select: { email: true, firstName: true } },
          },
        },
      },
    });
  }

  async deleteReview(reviewId: string) {
    const r = await this.prisma.review.findUnique({ where: { id: reviewId } });
    if (!r) {
      throw new NotFoundException('Review not found');
    }
    await this.prisma.review.delete({ where: { id: reviewId } });
    await this.workersService.recalculateRating(r.workerProfileId);
    return { deleted: true };
  }
}
