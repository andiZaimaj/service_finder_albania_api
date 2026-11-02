import { ApiProperty } from '@nestjs/swagger';
import { SubscriptionTier } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class CreateCheckoutDto {
  @ApiProperty({ enum: [SubscriptionTier.BASIC, SubscriptionTier.PRO] })
  @IsEnum(SubscriptionTier, {
    message: 'tier must be BASIC or PRO',
  })
  tier!: SubscriptionTier;
}
