import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async createNotification(
    userId: string,
    type: string,
    title: string,
    body: string,
  ) {
    return this.prisma.notification.create({
      data: { userId, type, title, body },
    });
  }

  /** Bulk fan-out, e.g. alerting every worker who matches a freshly posted job. */
  async createManyNotifications(
    notifications: {
      userId: string;
      type: string;
      title: string;
      body: string;
    }[],
  ) {
    if (!notifications.length) {
      return { count: 0 };
    }
    return this.prisma.notification.createMany({ data: notifications });
  }

  async listForUser(userId: string, page: number, limit: number) {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: [{ isRead: 'asc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.notification.count({ where: { userId } }),
    ]);
    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  async markRead(userId: string, id: string) {
    const n = await this.prisma.notification.findFirst({
      where: { id, userId },
    });
    if (!n) {
      return null;
    }
    return this.prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
    return { updated: true };
  }
}
