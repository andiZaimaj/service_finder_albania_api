import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SubscriptionTier } from '@prisma/client';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { PrismaService } from '../prisma/prisma.service';
import { ListWorkersQueryDto, WorkersSortBy } from './dto/list-workers-query.dto';
import { UpdateWorkerProfileDto } from './dto/update-worker-profile.dto';

const tierRank = (t: SubscriptionTier): number => {
  if (t === SubscriptionTier.PRO) return 0;
  if (t === SubscriptionTier.BASIC) return 1;
  return 2;
};

@Injectable()
export class WorkersService {
  private readonly supabase: SupabaseClient | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    const url = this.configService.get<string>('SUPABASE_URL');
    const key = this.configService.get<string>('SUPABASE_KEY');
    this.supabase =
      url && key && !url.includes('your-project') ? createClient(url, key) : null;
  }

  async list(query: ListWorkersQueryDto) {
    const where: {
      subscriptionTier?: SubscriptionTier;
      cities?: { some: { city: { equals: string; mode: 'insensitive' } } };
      categories?: { some: { category: { slug: string } } };
    } = {};

    if (query.subscriptionTier) {
      where.subscriptionTier = query.subscriptionTier;
    }

    if (query.city) {
      where.cities = {
        some: { city: { equals: query.city, mode: 'insensitive' } },
      };
    }

    if (query.category) {
      where.categories = {
        some: { category: { slug: query.category } },
      };
    }

    const workers = await this.prisma.workerProfile.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
          },
        },
        cities: true,
        categories: { include: { category: true } },
      },
    });

    workers.sort((a, b) => {
      const tr = tierRank(a.subscriptionTier) - tierRank(b.subscriptionTier);
      if (tr !== 0) return tr;
      if (query.sortBy === WorkersSortBy.NEWEST) {
        return b.createdAt.getTime() - a.createdAt.getTime();
      }
      if (b.averageRating !== a.averageRating) {
        return b.averageRating - a.averageRating;
      }
      return b.createdAt.getTime() - a.createdAt.getTime();
    });

    return workers;
  }

  async findOne(id: string) {
    const w = await this.prisma.workerProfile.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
            phone: true,
          },
        },
        cities: true,
        categories: { include: { category: true } },
        reviews: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: {
            client: {
              select: { firstName: true, lastName: true, avatarUrl: true },
            },
          },
        },
      },
    });
    if (!w) {
      throw new NotFoundException('Worker not found');
    }
    return w;
  }

  async updateMe(userId: string, dto: UpdateWorkerProfileDto) {
    const profile = await this.prisma.workerProfile.findUnique({
      where: { userId },
    });
    if (!profile) {
      throw new NotFoundException('Worker profile not found');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.workerProfile.update({
        where: { id: profile.id },
        data: {
          bio: dto.bio ?? undefined,
          businessName: dto.businessName ?? undefined,
        },
      });

      if (dto.cities) {
        await tx.workerCity.deleteMany({
          where: { workerProfileId: profile.id },
        });
        if (dto.cities.length) {
          await tx.workerCity.createMany({
            data: dto.cities.map((city) => ({
              workerProfileId: profile.id,
              city,
            })),
          });
        }
      }

      if (dto.categoryIds) {
        await tx.workerCategory.deleteMany({
          where: { workerProfileId: profile.id },
        });
        if (dto.categoryIds.length) {
          await tx.workerCategory.createMany({
            data: dto.categoryIds.map((categoryId) => ({
              workerProfileId: profile.id,
              categoryId,
            })),
            skipDuplicates: true,
          });
        }
      }
    });

    return this.findOne(profile.id);
  }

  async uploadNationalId(userId: string, file: Express.Multer.File) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('File required');
    }
    if (!this.supabase) {
      throw new BadRequestException('Supabase is not configured');
    }
    const profile = await this.prisma.workerProfile.findUnique({
      where: { userId },
    });
    if (!profile) {
      throw new NotFoundException('Worker profile not found');
    }
    const path = `national-ids/${userId}/${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const bucket = 'documents';
    const { error } = await this.supabase.storage
      .from(bucket)
      .upload(path, file.buffer, {
        contentType: file.mimetype,
        upsert: true,
      });
    if (error) {
      throw new BadRequestException(`Upload failed: ${error.message}`);
    }
    const { data: pub } = this.supabase.storage.from(bucket).getPublicUrl(path);
    await this.prisma.workerProfile.update({
      where: { id: profile.id },
      data: { nationalIdUrl: pub.publicUrl },
    });
    return { nationalIdUrl: pub.publicUrl };
  }

  /** Recalculate aggregate rating after reviews change. */
  async recalculateRating(workerProfileId: string): Promise<void> {
    const agg = await this.prisma.review.aggregate({
      where: { workerProfileId },
      _avg: { rating: true },
      _count: { rating: true },
    });
    await this.prisma.workerProfile.update({
      where: { id: workerProfileId },
      data: {
        averageRating: agg._avg.rating ?? 0,
        totalReviews: agg._count.rating,
      },
    });
  }
}
