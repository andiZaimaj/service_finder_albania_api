import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SubscriptionStatus,
  SubscriptionTier,
} from '@prisma/client';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';

type StripeClient = InstanceType<typeof Stripe>;
type StripeSubscriptionRetrieved = Awaited<
  ReturnType<StripeClient['subscriptions']['retrieve']>
>;

/** Fields we read from Stripe Checkout session in webhooks */
interface CheckoutSessionPayload {
  subscription?: string | { id?: string } | null;
  metadata?: Record<string, string | undefined> | null;
}

@Injectable()
export class SubscriptionsService {
  private readonly stripe: StripeClient;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    const key = this.configService.getOrThrow<string>('STRIPE_SECRET_KEY');
    this.stripe = new Stripe(key);
  }

  private priceIdForTier(tier: SubscriptionTier): string {
    if (tier === SubscriptionTier.BASIC) {
      return this.configService.getOrThrow<string>('STRIPE_BASIC_PRICE_ID');
    }
    return this.configService.getOrThrow<string>('STRIPE_PRO_PRICE_ID');
  }

  async createCheckoutSession(workerUserId: string, tier: SubscriptionTier) {
    if (tier !== SubscriptionTier.BASIC && tier !== SubscriptionTier.PRO) {
      throw new BadRequestException('tier must be BASIC or PRO');
    }
    const profile = await this.prisma.workerProfile.findUnique({
      where: { userId: workerUserId },
    });
    if (!profile) {
      throw new BadRequestException('Worker profile required');
    }
    let customerId = profile.stripeCustomerId;
    if (!customerId) {
      const user = await this.prisma.user.findUniqueOrThrow({
        where: { id: workerUserId },
      });
      const customer = await this.stripe.customers.create({
        email: user.email,
        metadata: { userId: workerUserId },
      });
      customerId = customer.id;
      await this.prisma.workerProfile.update({
        where: { id: profile.id },
        data: { stripeCustomerId: customerId },
      });
    }
    const appUrl = this.configService.get<string>('APP_URL') ?? 'http://localhost:3000';
    const priceId = this.priceIdForTier(tier);
    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/subscriptions/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/subscriptions/cancel`,
      metadata: {
        workerProfileId: profile.id,
        userId: workerUserId,
        tier,
      },
    });
    return { url: session.url, sessionId: session.id };
  }

  async getMe(workerUserId: string) {
    const profile = await this.prisma.workerProfile.findUnique({
      where: { userId: workerUserId },
    });
    if (!profile) {
      throw new BadRequestException('Worker profile required');
    }
    return {
      subscriptionTier: profile.subscriptionTier,
      subscriptionStatus: profile.subscriptionStatus,
      subscriptionExpiresAt: profile.subscriptionExpiresAt,
      stripeCustomerId: profile.stripeCustomerId,
      stripeSubscriptionId: profile.stripeSubscriptionId,
    };
  }

  async cancelAtPeriodEnd(workerUserId: string) {
    const profile = await this.prisma.workerProfile.findUnique({
      where: { userId: workerUserId },
    });
    if (!profile?.stripeSubscriptionId) {
      throw new BadRequestException('No active Stripe subscription');
    }
    await this.stripe.subscriptions.update(profile.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });
    return { cancelAtPeriodEnd: true };
  }

  async handleStripeWebhook(rawBody: Buffer, signature: string | string[] | undefined) {
    const whSecret = this.configService.getOrThrow<string>('STRIPE_WEBHOOK_SECRET');
    const sig = Array.isArray(signature) ? signature[0] : signature;
    if (!sig) {
      throw new BadRequestException('Missing stripe-signature');
    }
    let event: ReturnType<StripeClient['webhooks']['constructEvent']>;
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, sig, whSecret);
    } catch (err) {
      throw new BadRequestException(
        `Webhook signature verification failed: ${err instanceof Error ? err.message : err}`,
      );
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as CheckoutSessionPayload;
        await this.onCheckoutCompleted(session);
        break;
      }
      case 'customer.subscription.updated': {
        const sub = event.data.object as StripeSubscriptionRetrieved;
        await this.syncSubscription(sub);
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as StripeSubscriptionRetrieved;
        await this.onSubscriptionDeleted(sub);
        break;
      }
      default:
        break;
    }
    return { received: true };
  }

  private tierFromPriceId(priceId: string): SubscriptionTier {
    const basic = this.configService.get<string>('STRIPE_BASIC_PRICE_ID');
    const pro = this.configService.get<string>('STRIPE_PRO_PRICE_ID');
    if (priceId === basic) return SubscriptionTier.BASIC;
    if (priceId === pro) return SubscriptionTier.PRO;
    return SubscriptionTier.NONE;
  }

  private async onCheckoutCompleted(session: CheckoutSessionPayload) {
    const subId =
      typeof session.subscription === 'string'
        ? session.subscription
        : session.subscription?.id;
    if (!subId) return;
    const sub = await this.stripe.subscriptions.retrieve(subId);
    const metaTier = session.metadata?.tier as SubscriptionTier | undefined;
    await this.syncSubscription(sub, metaTier);
  }

  private async syncSubscription(
    sub: StripeSubscriptionRetrieved,
    metadataTier?: SubscriptionTier,
  ) {
    const customerId =
      typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
    const profile = await this.prisma.workerProfile.findFirst({
      where: { stripeCustomerId: customerId },
    });
    if (!profile) {
      return;
    }
    const priceId = sub.items.data[0]?.price?.id;
    let tier =
      priceId && this.tierFromPriceId(priceId) !== SubscriptionTier.NONE
        ? this.tierFromPriceId(priceId)
        : SubscriptionTier.NONE;
    if (
      metadataTier === SubscriptionTier.BASIC ||
      metadataTier === SubscriptionTier.PRO
    ) {
      tier = metadataTier;
    }
    const periodEndSec = (
      sub as unknown as { current_period_end?: number }
    ).current_period_end;
    const currentPeriodEnd = periodEndSec
      ? new Date(periodEndSec * 1000)
      : null;
    await this.prisma.workerProfile.update({
      where: { id: profile.id },
      data: {
        stripeSubscriptionId: sub.id,
        subscriptionStatus:
          sub.status === 'active' || sub.status === 'trialing'
            ? SubscriptionStatus.ACTIVE
            : SubscriptionStatus.INACTIVE,
        subscriptionTier: tier === SubscriptionTier.NONE ? SubscriptionTier.NONE : tier,
        subscriptionExpiresAt: currentPeriodEnd,
      },
    });
  }

  private async onSubscriptionDeleted(sub: StripeSubscriptionRetrieved) {
    const customerId =
      typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
    const profile = await this.prisma.workerProfile.findFirst({
      where: { stripeCustomerId: customerId },
    });
    if (!profile) {
      return;
    }
    await this.prisma.workerProfile.update({
      where: { id: profile.id },
      data: {
        stripeSubscriptionId: null,
        subscriptionTier: SubscriptionTier.NONE,
        subscriptionStatus: SubscriptionStatus.CANCELLED,
        subscriptionExpiresAt: null,
      },
    });
  }
}
