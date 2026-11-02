import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WorkersService } from '../workers/workers.service';
import { CreateReviewDto } from './dto/create-review.dto';

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workersService: WorkersService,
  ) {}

  async create(clientUserId: string, dto: CreateReviewDto) {
    const job = await this.prisma.jobPost.findUnique({
      where: { id: dto.jobPostId },
    });
    if (!job || job.clientId !== clientUserId) {
      throw new ForbiddenException('Job does not belong to you');
    }
    try {
      const review = await this.prisma.review.create({
        data: {
          clientId: clientUserId,
          workerProfileId: dto.workerProfileId,
          jobPostId: dto.jobPostId,
          rating: dto.rating,
          comment: dto.comment,
        },
      });
      await this.workersService.recalculateRating(dto.workerProfileId);
      return review;
    } catch (e: unknown) {
      if (
        e &&
        typeof e === 'object' &&
        'code' in e &&
        (e as { code: string }).code === 'P2002'
      ) {
        throw new ConflictException(
          'You already reviewed this worker for this job',
        );
      }
      throw e;
    }
  }
}
