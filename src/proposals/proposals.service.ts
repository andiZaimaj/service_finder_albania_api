import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  JobStatus,
  ProposalStatus,
  SubscriptionTier,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProposalDto } from './dto/create-proposal.dto';
import { UpdateProposalDto } from './dto/update-proposal.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class ProposalsService {
  constructor(private readonly prisma: PrismaService) {}

  private async requirePaidWorker(userId: string) {
    const profile = await this.prisma.workerProfile.findUnique({
      where: { userId },
    });
    if (!profile) {
      throw new ForbiddenException('Worker profile required');
    }
    if (
      profile.subscriptionTier !== SubscriptionTier.BASIC &&
      profile.subscriptionTier !== SubscriptionTier.PRO
    ) {
      throw new ForbiddenException('BASIC or PRO subscription required');
    }
    return profile;
  }

  async createProposal(workerUserId: string, jobId: string, dto: CreateProposalDto) {
    const profile = await this.requirePaidWorker(workerUserId);
    const job = await this.prisma.jobPost.findUnique({ where: { id: jobId } });
    if (!job || job.status !== JobStatus.OPEN) {
      throw new NotFoundException('Job not open');
    }
    try {
      return await this.prisma.jobProposal.create({
        data: {
          jobPostId: jobId,
          workerProfileId: profile.id,
          message: dto.message,
          priceEstimate: new Prisma.Decimal(dto.priceEstimate),
          status: ProposalStatus.PENDING,
        },
        include: {
          workerProfile: {
            include: {
              user: {
                select: { firstName: true, lastName: true, avatarUrl: true },
              },
            },
          },
        },
      });
    } catch (e: unknown) {
      if (
        e &&
        typeof e === 'object' &&
        'code' in e &&
        (e as { code: string }).code === 'P2002'
      ) {
        throw new ConflictException('You already submitted a proposal for this job');
      }
      throw e;
    }
  }

  async listProposalsForClient(clientUserId: string, jobId: string) {
    const job = await this.prisma.jobPost.findUnique({
      where: { id: jobId },
      include: {
        proposals: {
          include: {
            workerProfile: {
              include: {
                user: {
                  select: {
                    firstName: true,
                    lastName: true,
                    avatarUrl: true,
                  },
                },
                cities: true,
              },
            },
          },
        },
      },
    });
    if (!job || job.clientId !== clientUserId) {
      throw new NotFoundException('Job not found');
    }
    return job.proposals.map((p) => ({
      id: p.id,
      message: p.message,
      priceEstimate: p.priceEstimate,
      status: p.status,
      createdAt: p.createdAt,
      worker: {
        name: `${p.workerProfile.user.firstName} ${p.workerProfile.user.lastName}`,
        avatarUrl: p.workerProfile.user.avatarUrl,
        averageRating: p.workerProfile.averageRating,
        totalReviews: p.workerProfile.totalReviews,
        cities: p.workerProfile.cities.map((c) => c.city),
      },
    }));
  }

  async updateOwnProposal(
    workerUserId: string,
    proposalId: string,
    dto: UpdateProposalDto,
  ) {
    const profile = await this.prisma.workerProfile.findUnique({
      where: { userId: workerUserId },
    });
    if (!profile) {
      throw new NotFoundException('Worker profile not found');
    }
    const proposal = await this.prisma.jobProposal.findUnique({
      where: { id: proposalId },
    });
    if (!proposal || proposal.workerProfileId !== profile.id) {
      throw new NotFoundException('Proposal not found');
    }
    if (proposal.status !== ProposalStatus.PENDING) {
      throw new BadRequestException('Only PENDING proposals can be edited');
    }
    return this.prisma.jobProposal.update({
      where: { id: proposalId },
      data: {
        message: dto.message,
        priceEstimate:
          dto.priceEstimate !== undefined
            ? new Prisma.Decimal(dto.priceEstimate)
            : undefined,
      },
    });
  }

  async acceptProposal(clientUserId: string, proposalId: string) {
    const proposal = await this.prisma.jobProposal.findUnique({
      where: { id: proposalId },
      include: { jobPost: true },
    });
    if (!proposal || proposal.jobPost.clientId !== clientUserId) {
      throw new NotFoundException('Proposal not found');
    }
    if (proposal.jobPost.status !== JobStatus.OPEN) {
      throw new BadRequestException('Job is not open');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.jobProposal.update({
        where: { id: proposalId },
        data: { status: ProposalStatus.ACCEPTED },
      });
      await tx.jobProposal.updateMany({
        where: {
          jobPostId: proposal.jobPostId,
          id: { not: proposalId },
        },
        data: { status: ProposalStatus.REJECTED },
      });
      await tx.jobPost.update({
        where: { id: proposal.jobPostId },
        data: { status: JobStatus.CLOSED },
      });
    });
    return { accepted: true };
  }

  async rejectProposal(clientUserId: string, proposalId: string) {
    const proposal = await this.prisma.jobProposal.findUnique({
      where: { id: proposalId },
      include: { jobPost: true },
    });
    if (!proposal || proposal.jobPost.clientId !== clientUserId) {
      throw new NotFoundException('Proposal not found');
    }
    if (proposal.status !== ProposalStatus.PENDING) {
      throw new BadRequestException('Proposal is not pending');
    }
    return this.prisma.jobProposal.update({
      where: { id: proposalId },
      data: { status: ProposalStatus.REJECTED },
    });
  }
}
