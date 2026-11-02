import { Body, Controller, Param, Patch, Post, UseGuards } from '@nestjs/common';
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
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { ProposalsService } from './proposals.service';
import { UpdateProposalDto } from './dto/update-proposal.dto';

@ApiTags('proposals')
@Controller('proposals')
export class ProposalsController {
  constructor(private readonly proposalsService: ProposalsService) {}

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.WORKER)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Edit own PENDING proposal' })
  @ApiResponse({ status: 200 })
  update(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateProposalDto,
  ) {
    return this.proposalsService.updateOwnProposal(user.sub, id, dto);
  }

  @Post(':id/accept')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CLIENT)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Accept proposal (closes job, rejects other proposals)',
  })
  @ApiResponse({ status: 200 })
  accept(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.proposalsService.acceptProposal(user.sub, id);
  }

  @Post(':id/reject')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CLIENT)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Reject a proposal' })
  @ApiResponse({ status: 200 })
  reject(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.proposalsService.rejectProposal(user.sub, id);
  }
}
