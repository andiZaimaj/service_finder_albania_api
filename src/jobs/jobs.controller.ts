import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
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
import { PaidWorkerOrAdminGuard } from '../common/guards/paid-worker-or-admin.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { JobsService } from './jobs.service';
import { CreateJobDto } from './dto/create-job.dto';
import { UpdateJobDto } from './dto/update-job.dto';
import { ListJobsQueryDto } from './dto/list-jobs-query.dto';
import { ListMyJobsQueryDto } from './dto/list-my-jobs-query.dto';
import { ProposalsService } from '../proposals/proposals.service';
import { CreateProposalDto } from '../proposals/dto/create-proposal.dto';

@ApiTags('jobs')
@Controller('jobs')
export class JobsController {
  constructor(
    private readonly jobsService: JobsService,
    private readonly proposalsService: ProposalsService,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CLIENT)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Create a job post (client)' })
  @ApiResponse({ status: 201 })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateJobDto) {
    return this.jobsService.create(user.sub, dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard, PaidWorkerOrAdminGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'List open jobs (paid workers BASIC/PRO or admin)',
  })
  @ApiResponse({ status: 200 })
  list(@CurrentUser() user: JwtPayload, @Query() query: ListJobsQueryDto) {
    return this.jobsService.listOpen(user, query);
  }

  // Declared before ':id' so the literal path is not swallowed by the param route.
  @Get('mine')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CLIENT)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: "List the signed-in client's own job posts, with proposal counts",
  })
  @ApiResponse({ status: 200 })
  listMine(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListMyJobsQueryDto,
  ) {
    return this.jobsService.listForClient(user.sub, query);
  }

  @Get(':id/proposals')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CLIENT)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary:
      'List proposals for a job (client owner) with worker mini-profiles',
  })
  @ApiResponse({ status: 200 })
  listProposals(@Param('id') jobId: string, @CurrentUser() user: JwtPayload) {
    return this.proposalsService.listProposalsForClient(user.sub, jobId);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get job with proposals (visibility rules apply)' })
  @ApiResponse({ status: 200 })
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.jobsService.findOne(id, user);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CLIENT)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Update own job post' })
  @ApiResponse({ status: 200 })
  update(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateJobDto,
  ) {
    return this.jobsService.updateJob(id, user.sub, dto);
  }

  @Post(':id/close')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CLIENT)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Close own job post' })
  @ApiResponse({ status: 200 })
  close(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.jobsService.closeJob(id, user.sub);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CLIENT)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Delete own OPEN job' })
  @ApiResponse({ status: 200 })
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.jobsService.deleteJob(id, user.sub);
  }

  @Post(':id/proposals')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.WORKER)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Submit proposal (paid worker)' })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 409, description: 'Duplicate proposal' })
  createProposal(
    @Param('id') jobId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateProposalDto,
  ) {
    return this.proposalsService.createProposal(user.sub, jobId, dto);
  }
}
