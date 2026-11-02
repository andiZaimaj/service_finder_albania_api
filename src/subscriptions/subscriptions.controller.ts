import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Post,
  type RawBodyRequest,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { SubscriptionsService } from './subscriptions.service';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('subscriptions')
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Post('create-checkout')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.WORKER)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Start Stripe Checkout for BASIC or PRO' })
  @ApiResponse({ status: 201 })
  createCheckout(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateCheckoutDto,
  ) {
    return this.subscriptionsService.createCheckoutSession(user.sub, dto.tier);
  }

  @Public()
  @Post('webhook')
  @ApiOperation({ summary: 'Stripe webhook (raw body)' })
  @ApiResponse({ status: 200 })
  async webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string | string[] | undefined,
  ) {
    const raw = req.rawBody;
    if (!raw) {
      throw new BadRequestException(
        'Raw body missing; enable rawBody in NestFactory.create',
      );
    }
    return this.subscriptionsService.handleStripeWebhook(raw, signature);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.WORKER)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Current worker subscription status' })
  @ApiResponse({ status: 200 })
  me(@CurrentUser() user: JwtPayload) {
    return this.subscriptionsService.getMe(user.sub);
  }

  @Post('cancel')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.WORKER)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Cancel subscription at period end' })
  @ApiResponse({ status: 200 })
  cancel(@CurrentUser() user: JwtPayload) {
    return this.subscriptionsService.cancelAtPeriodEnd(user.sub);
  }
}
