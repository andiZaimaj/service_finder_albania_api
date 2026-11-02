import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { WorkersService } from './workers.service';
import { ListWorkersQueryDto } from './dto/list-workers-query.dto';
import { UpdateWorkerProfileDto } from './dto/update-worker-profile.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('workers')
@Controller('workers')
export class WorkersController {
  constructor(
    private readonly workersService: WorkersService,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: 'List workers (PRO first, then by rating or newest)',
  })
  @ApiResponse({ status: 200 })
  list(@Query() query: ListWorkersQueryDto) {
    return this.workersService.list(query);
  }

  @Public()
  @Get(':id/reviews')
  @ApiOperation({ summary: 'Paginated reviews for a worker' })
  @ApiResponse({ status: 200 })
  async listReviews(
    @Param('id') workerProfileId: string,
    @Query() q: PaginationQueryDto,
  ) {
    const page = q.page ?? 1;
    const limit = q.limit ?? 20;
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.review.findMany({
        where: { workerProfileId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          client: {
            select: { firstName: true, lastName: true, avatarUrl: true },
          },
          jobPost: { select: { id: true, title: true } },
        },
      }),
      this.prisma.review.count({ where: { workerProfileId } }),
    ]);
    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Worker profile with categories, cities, recent reviews' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404 })
  findOne(@Param('id') id: string) {
    return this.workersService.findOne(id);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.WORKER)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Update own worker profile' })
  @ApiResponse({ status: 200 })
  updateMe(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateWorkerProfileDto,
  ) {
    return this.workersService.updateMe(user.sub, dto);
  }

  @Post('me/upload-id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.WORKER)
  @ApiBearerAuth('access-token')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @ApiOperation({ summary: 'Upload national ID document (Supabase Storage)' })
  @ApiResponse({ status: 201 })
  uploadId(
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.workersService.uploadNationalId(user.sub, file);
  }
}
