import { ApiPropertyOptional } from '@nestjs/swagger';
import { SubscriptionTier } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export enum WorkersSortBy {
  RATING = 'rating',
  NEWEST = 'newest',
}

export class ListWorkersQueryDto {
  @ApiPropertyOptional({ description: 'Category slug' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ enum: SubscriptionTier })
  @IsOptional()
  @IsEnum(SubscriptionTier)
  subscriptionTier?: SubscriptionTier;

  @ApiPropertyOptional({ enum: WorkersSortBy })
  @IsOptional()
  @IsEnum(WorkersSortBy)
  sortBy?: WorkersSortBy = WorkersSortBy.RATING;
}
