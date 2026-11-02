import {
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminService } from './admin.service';
import { AdminListUsersQueryDto } from './dto/list-users-query.dto';

@ApiTags('admin')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('users')
  @ApiOperation({ summary: 'List users (filters)' })
  @ApiResponse({ status: 200 })
  listUsers(@Query() query: AdminListUsersQueryDto) {
    return this.adminService.listUsers(query);
  }

  @Patch('users/:id/deactivate')
  @ApiOperation({ summary: 'Deactivate user account' })
  @ApiResponse({ status: 200 })
  deactivate(@Param('id') id: string) {
    return this.adminService.deactivateUser(id);
  }

  @Patch('users/:id/verify-id')
  @ApiOperation({ summary: 'Mark worker national ID as verified' })
  @ApiResponse({ status: 200 })
  verifyId(@Param('id') id: string) {
    return this.adminService.verifyWorkerId(id);
  }

  @Get('jobs')
  @ApiOperation({ summary: 'List all job posts' })
  @ApiResponse({ status: 200 })
  listJobs() {
    return this.adminService.listJobs();
  }

  @Delete('jobs/:id')
  @ApiOperation({ summary: 'Delete any job post' })
  @ApiResponse({ status: 200 })
  deleteJob(@Param('id') id: string) {
    return this.adminService.deleteJob(id);
  }

  @Get('reviews')
  @ApiOperation({ summary: 'List all reviews' })
  @ApiResponse({ status: 200 })
  listReviews() {
    return this.adminService.listReviews();
  }

  @Delete('reviews/:id')
  @ApiOperation({ summary: 'Delete a review' })
  @ApiResponse({ status: 200 })
  deleteReview(@Param('id') id: string) {
    return this.adminService.deleteReview(id);
  }
}
