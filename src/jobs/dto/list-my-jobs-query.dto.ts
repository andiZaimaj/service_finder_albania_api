import { ApiPropertyOptional } from '@nestjs/swagger';
import { JobStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class ListMyJobsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: JobStatus, enumName: 'JobStatus' })
  @IsOptional()
  @IsEnum(JobStatus)
  status?: JobStatus;
}
