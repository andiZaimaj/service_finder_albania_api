import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MessagesService {
  constructor(private readonly prisma: PrismaService) {}

  async send(senderId: string, receiverId: string, jobPostId: string | undefined, content: string) {
    if (senderId === receiverId) {
      throw new ForbiddenException('Cannot message yourself');
    }
    return this.prisma.message.create({
      data: {
        senderId,
        receiverId,
        jobPostId,
        content,
      },
      include: {
        sender: {
          select: { id: true, firstName: true, lastName: true, avatarUrl: true },
        },
        receiver: {
          select: { id: true, firstName: true, lastName: true, avatarUrl: true },
        },
      },
    });
  }

  async listConversations(userId: string) {
    const messages = await this.prisma.message.findMany({
      where: {
        OR: [{ senderId: userId }, { receiverId: userId }],
      },
      orderBy: { createdAt: 'desc' },
      include: {
        sender: {
          select: { id: true, firstName: true, lastName: true, avatarUrl: true },
        },
        receiver: {
          select: { id: true, firstName: true, lastName: true, avatarUrl: true },
        },
      },
    });

    const byPeer = new Map<
      string,
      {
        peer: { id: string; firstName: string; lastName: string; avatarUrl: string | null };
        lastMessage: (typeof messages)[0];
        unreadCount: number;
      }
    >();

    for (const m of messages) {
      const peerId = m.senderId === userId ? m.receiverId : m.senderId;
      if (!byPeer.has(peerId)) {
        const peer = m.senderId === userId ? m.receiver : m.sender;
        const unread = await this.prisma.message.count({
          where: {
            senderId: peerId,
            receiverId: userId,
            isRead: false,
          },
        });
        byPeer.set(peerId, { peer, lastMessage: m, unreadCount: unread });
      }
    }

    return [...byPeer.values()].sort(
      (a, b) =>
        b.lastMessage.createdAt.getTime() - a.lastMessage.createdAt.getTime(),
    );
  }

  async getThread(currentUserId: string, otherUserId: string) {
    return this.prisma.message.findMany({
      where: {
        OR: [
          { senderId: currentUserId, receiverId: otherUserId },
          { senderId: otherUserId, receiverId: currentUserId },
        ],
      },
      orderBy: { createdAt: 'asc' },
      include: {
        jobPost: { select: { id: true, title: true } },
      },
    });
  }

  async markRead(currentUserId: string, messageId: string) {
    const msg = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!msg || msg.receiverId !== currentUserId) {
      throw new NotFoundException('Message not found');
    }
    return this.prisma.message.update({
      where: { id: messageId },
      data: { isRead: true },
    });
  }
}
