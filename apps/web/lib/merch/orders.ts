import 'server-only';

import crypto from 'node:crypto';
import { and, asc, sql as drizzleSql, eq, inArray, ne } from 'drizzle-orm';
import type Stripe from 'stripe';
import { db } from '@/lib/db';
import {
  type MerchCard,
  type MerchOrder,
  type MerchShippingAddress,
  merchCards,
  merchFulfillmentJobs,
  merchOrders,
  merchPayoutLedgerEntries,
} from '@/lib/db/schema/merch';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { publicEnv } from '@/lib/env-public';
import {
  confirmOrder,
  createDraftOrder,
  isPrintfulConfigured,
  type PrintfulCreateOrderInput,
} from '@/lib/printful/client';
import { stripe } from '@/lib/stripe/client';
import { logger } from '@/lib/utils/logger';
import {
  estimateStripeFeeCents,
  MERCH_DEFAULT_REFUND_RESERVE_CENTS,
} from './pricing';
import { getMerchCardSellability, getMerchOrderSellability } from './safety';
import { refreshMerchRank, resolveVariantId } from './service';
import type {
  MerchCheckoutInput,
  MerchCheckoutSessionResult,
  MerchOrderFulfillmentInput,
} from './types';

const MAX_FULFILLMENT_ATTEMPTS = 5;
const PRE_SUBMIT_ORDER_STATUSES: ReadonlySet<MerchOrder['status']> = new Set([
  'checkout_created',
  'paid',
  'paid_fulfillment_hold',
  'paid_fulfillment_failed',
]);

function merchBaseUrl(): string {
  return publicEnv.NEXT_PUBLIC_PROFILE_URL || 'https://jov.ie';
}

function stripeSessionToShippingAddress(
  session: Stripe.Checkout.Session
): MerchShippingAddress | null {
  const details = (
    session as Stripe.Checkout.Session & {
      readonly shipping_details?: {
        readonly name?: string | null;
        readonly address?: Stripe.Address | null;
      } | null;
    }
  ).shipping_details;
  const address = details?.address;
  if (!address) return null;

  return {
    name: details.name ?? session.customer_details?.name ?? null,
    line1: address.line1 ?? null,
    line2: address.line2 ?? null,
    city: address.city ?? null,
    state: address.state ?? null,
    postalCode: address.postal_code ?? null,
    country: address.country ?? null,
    phone: session.customer_details?.phone ?? null,
  };
}

function validateShippingAddress(
  address: MerchShippingAddress | null | undefined
): address is MerchShippingAddress & {
  readonly name: string;
  readonly line1: string;
  readonly city: string;
  readonly postalCode: string;
  readonly country: string;
} {
  return Boolean(
    address?.name &&
      address.line1 &&
      address.city &&
      address.postalCode &&
      address.country
  );
}

function assertMerchCardCheckoutSellable(card: MerchCard): void {
  const result = getMerchCardSellability(card);
  if (!result.sellable) {
    throw new Error(`Merch item is not sellable: ${result.reasons.join(' ')}`);
  }
}

function assertMerchOrderSellable(
  order: Pick<
    MerchOrder,
    | 'quantity'
    | 'subtotalCents'
    | 'printfulProductCostCents'
    | 'stripeFeeEstimateCents'
    | 'refundReserveCents'
    | 'artistPayoutEstimateCents'
    | 'jovieShareEstimateCents'
  >
): void {
  const result = getMerchOrderSellability(order);
  if (!result.sellable) {
    throw new Error(`Merch order is not sellable: ${result.reasons.join(' ')}`);
  }
}

function toPrintfulTechnique(technique: string): string {
  return technique === 'cut_and_sew' ? 'cut-sew' : technique;
}

function buildPrintfulOrderInput(params: {
  readonly order: MerchOrder;
  readonly card: MerchCard;
  readonly fulfillment: MerchOrderFulfillmentInput;
}): PrintfulCreateOrderInput {
  const printFileUrl = params.card.printful.printFileUrls[0];
  if (!printFileUrl) {
    throw new Error('Merch card is missing a Printful print file URL');
  }

  const address = params.fulfillment.shippingAddress;
  if (!validateShippingAddress(address)) {
    throw new Error('Order is missing a complete shipping address');
  }

  return {
    external_id: params.order.printfulExternalId ?? params.order.id,
    recipient: {
      name: address.name,
      email: params.fulfillment.buyerEmail,
      phone: address.phone ?? null,
      address1: address.line1,
      address2: address.line2 ?? null,
      city: address.city,
      state_code: address.state ?? null,
      country_code: address.country,
      zip: address.postalCode,
    },
    order_items: [
      {
        quantity: params.order.quantity,
        catalog_variant_id: params.order.selectedVariantId,
        source: 'catalog',
        placements: params.card.printful.placements.map(placement => ({
          placement,
          technique: toPrintfulTechnique(
            params.card.printful.techniques[0] ?? 'dtg'
          ),
          layers: [
            {
              type: 'file',
              url: printFileUrl,
            },
          ],
        })),
      },
    ],
  };
}

async function getOrderWithCard(orderId: string): Promise<{
  readonly order: MerchOrder;
  readonly card: MerchCard;
} | null> {
  const [row] = await db
    .select({ order: merchOrders, card: merchCards })
    .from(merchOrders)
    .innerJoin(merchCards, eq(merchCards.id, merchOrders.merchCardId))
    .where(eq(merchOrders.id, orderId))
    .limit(1);

  return row ?? null;
}

export async function createMerchCheckoutSession(
  input: MerchCheckoutInput
): Promise<MerchCheckoutSessionResult> {
  const [row] = await db
    .select({ card: merchCards, profile: creatorProfiles })
    .from(merchCards)
    .innerJoin(
      creatorProfiles,
      eq(creatorProfiles.id, merchCards.creatorProfileId)
    )
    .where(
      and(eq(merchCards.id, input.merchCardId), eq(merchCards.status, 'live'))
    )
    .limit(1);

  if (!row) {
    throw new Error('Merch item is not available');
  }
  assertMerchCardCheckoutSellable(row.card);

  const variantId = resolveVariantId(
    row.card.printful.variantMap,
    input.variantKey
  );
  if (!variantId) {
    throw new Error('Selected merch variant is not available');
  }

  const quantity = Math.min(Math.max(input.quantity, 1), 5);
  const subtotalCents = row.card.retailPriceCents * quantity;
  const shippingCents = row.card.estimatedShippingCostCents;
  const totalCents = subtotalCents + shippingCents;
  const stripeFeeEstimateCents = estimateStripeFeeCents(totalCents);
  const printfulProductCostCents =
    row.card.estimatedPrintfulProductCostCents * quantity;
  const printfulShippingCostCents = row.card.estimatedShippingCostCents;
  const refundReserveCents = MERCH_DEFAULT_REFUND_RESERVE_CENTS;
  const netProfitEstimateCents = Math.max(
    0,
    subtotalCents -
      printfulProductCostCents -
      stripeFeeEstimateCents -
      refundReserveCents
  );
  const artistPayoutEstimateCents = Math.floor(
    (netProfitEstimateCents * row.card.artistRoyaltyRateBps) / 10_000
  );
  const jovieShareEstimateCents =
    netProfitEstimateCents - artistPayoutEstimateCents;
  assertMerchOrderSellable({
    quantity,
    subtotalCents,
    printfulProductCostCents,
    stripeFeeEstimateCents,
    refundReserveCents,
    artistPayoutEstimateCents,
    jovieShareEstimateCents,
  });
  const printfulExternalId = `jovie_merch_${crypto.randomUUID()}`;

  const [order] = await db
    .insert(merchOrders)
    .values({
      creatorProfileId: row.card.creatorProfileId,
      merchCardId: row.card.id,
      status: 'checkout_created',
      printfulExternalId,
      selectedVariantId: variantId,
      selectedVariantKey: input.variantKey,
      quantity,
      currency: 'USD',
      subtotalCents,
      shippingCents,
      taxCents: 0,
      totalCents,
      stripeFeeEstimateCents,
      printfulProductCostCents,
      printfulShippingCostCents,
      refundReserveCents,
      artistPayoutEstimateCents,
      jovieShareEstimateCents,
      metadata: {
        source: 'merch_checkout',
        handle: input.handle,
      },
    })
    .returning();

  const baseUrl = merchBaseUrl();
  const handle = row.profile.usernameNormalized || input.handle;
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: row.card.title,
            description: row.card.description,
            images: row.card.primaryImageUrl ? [row.card.primaryImageUrl] : [],
          },
          unit_amount: row.card.retailPriceCents,
        },
        quantity,
      },
    ],
    shipping_options: [
      {
        shipping_rate_data: {
          type: 'fixed_amount',
          fixed_amount: { amount: shippingCents, currency: 'usd' },
          display_name: 'Standard shipping',
        },
      },
    ],
    shipping_address_collection: {
      allowed_countries: ['US'],
    },
    billing_address_collection: 'required',
    phone_number_collection: { enabled: true },
    metadata: {
      source: 'merch_checkout',
      merch_order_id: order.id,
      merch_card_id: row.card.id,
      profile_id: row.card.creatorProfileId,
      variant_key: input.variantKey,
      quantity: String(quantity),
    },
    payment_intent_data: {
      metadata: {
        source: 'merch_checkout',
        merch_order_id: order.id,
        merch_card_id: row.card.id,
        profile_id: row.card.creatorProfileId,
        variant_key: input.variantKey,
        quantity: String(quantity),
      },
    },
    success_url: `${baseUrl}/${handle}/merch/${row.card.id}?success=1&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/${handle}/merch/${row.card.id}?cancelled=1`,
  });

  if (!session.url) {
    throw new Error('Stripe did not return a checkout URL');
  }

  await db
    .update(merchOrders)
    .set({ stripeCheckoutSessionId: session.id, updatedAt: new Date() })
    .where(eq(merchOrders.id, order.id));

  await db
    .update(merchCards)
    .set({
      addToCarts: drizzleSql`${merchCards.addToCarts} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(merchCards.id, row.card.id));

  return { url: session.url, sessionId: session.id, orderId: order.id };
}

export async function handleMerchCheckoutCompleted(
  session: Stripe.Checkout.Session
): Promise<void> {
  const orderId = session.metadata?.merch_order_id;
  if (!orderId) {
    logger.warn('[merch] Stripe checkout completed without merch_order_id', {
      sessionId: session.id,
    });
    return;
  }

  const existing = await getOrderWithCard(orderId);
  if (!existing) {
    logger.warn('[merch] Stripe checkout completed for unknown order', {
      orderId,
      sessionId: session.id,
    });
    return;
  }

  if (
    existing.order.status !== 'checkout_created' &&
    existing.order.status !== 'paid'
  ) {
    return;
  }

  const paymentIntentId =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : (session.payment_intent?.id ?? null);
  const shippingAddress = stripeSessionToShippingAddress(session);
  const buyerEmail =
    session.customer_details?.email ?? session.customer_email ?? null;
  const buyerName =
    session.customer_details?.name ?? shippingAddress?.name ?? null;
  const paidAt = new Date();
  const cardSellability = getMerchCardSellability(existing.card);
  const orderSellability = getMerchOrderSellability(existing.order);
  const safetyReasons = [
    ...cardSellability.reasons,
    ...orderSellability.reasons,
  ];

  if (safetyReasons.length > 0) {
    await db
      .update(merchOrders)
      .set({
        status: 'paid_fulfillment_hold',
        stripeCheckoutSessionId: session.id,
        stripePaymentIntentId: paymentIntentId,
        buyerEmail,
        buyerName,
        shippingAddress,
        paidAt,
        error: `Merch order safety hold: ${safetyReasons.join(' ')}`,
        updatedAt: paidAt,
      })
      .where(eq(merchOrders.id, orderId));
    logger.error('[merch] Paid order held by merch safety guard', {
      orderId,
      merchCardId: existing.card.id,
      reasons: safetyReasons,
    });
    return;
  }

  await db
    .insert(merchFulfillmentJobs)
    .values({ merchOrderId: orderId, status: 'queued' })
    .onConflictDoNothing({ target: merchFulfillmentJobs.merchOrderId });

  const [ledgerEntry] = await db
    .insert(merchPayoutLedgerEntries)
    .values({
      creatorProfileId: existing.order.creatorProfileId,
      merchOrderId: existing.order.id,
      merchCardId: existing.order.merchCardId,
      grossSaleCents: existing.order.subtotalCents,
      taxCollectedCents: existing.order.taxCents,
      shippingCollectedCents: existing.order.shippingCents,
      stripeFeeEstimateCents: existing.order.stripeFeeEstimateCents,
      printfulProductCostCents: existing.order.printfulProductCostCents,
      printfulShippingCostCents: existing.order.printfulShippingCostCents,
      refundReserveCents: existing.order.refundReserveCents,
      netProfitEstimateCents:
        existing.order.artistPayoutEstimateCents +
        existing.order.jovieShareEstimateCents,
      artistShareCents: existing.order.artistPayoutEstimateCents,
      jovieShareCents: existing.order.jovieShareEstimateCents,
      payoutStatus: 'held_for_refund_window',
      metadata: { source: 'stripe_checkout_completed', sessionId: session.id },
    })
    .onConflictDoNothing({ target: merchPayoutLedgerEntries.merchOrderId })
    .returning({ id: merchPayoutLedgerEntries.id });

  if (ledgerEntry) {
    await db
      .update(merchCards)
      .set({
        purchases: drizzleSql`${merchCards.purchases} + ${existing.order.quantity}`,
        grossRevenueCents: drizzleSql`${merchCards.grossRevenueCents} + ${existing.order.subtotalCents}`,
        grossMarginCents: drizzleSql`${merchCards.grossMarginCents} + ${existing.order.jovieShareEstimateCents}`,
        artistPayoutAccruedCents: drizzleSql`${merchCards.artistPayoutAccruedCents} + ${existing.order.artistPayoutEstimateCents}`,
        updatedAt: paidAt,
      })
      .where(eq(merchCards.id, existing.order.merchCardId));

    await refreshMerchRank(existing.order.merchCardId);
  }

  await db
    .update(merchOrders)
    .set({
      status: 'paid',
      stripeCheckoutSessionId: session.id,
      stripePaymentIntentId: paymentIntentId,
      buyerEmail,
      buyerName,
      shippingAddress,
      paidAt,
      updatedAt: paidAt,
    })
    .where(eq(merchOrders.id, orderId));
}

export async function handleMerchChargeRefunded(
  charge: Stripe.Charge
): Promise<void> {
  const paymentIntentId =
    typeof charge.payment_intent === 'string'
      ? charge.payment_intent
      : charge.payment_intent?.id;
  if (!paymentIntentId) return;

  const [existingOrder] = await db
    .select()
    .from(merchOrders)
    .where(eq(merchOrders.stripePaymentIntentId, paymentIntentId))
    .limit(1);
  if (!existingOrder) return;

  const amountRefundedCents = charge.amount_refunded ?? 0;
  const amountCents = charge.amount ?? 0;
  const isFullRefund = amountCents > 0 && amountRefundedCents >= amountCents;
  if (!isFullRefund) {
    const now = new Date();
    const error = `Partial refund detected (${amountRefundedCents}/${amountCents}); manual merch payout review required`;
    await db
      .update(merchOrders)
      .set({
        status: PRE_SUBMIT_ORDER_STATUSES.has(existingOrder.status)
          ? 'paid_fulfillment_hold'
          : existingOrder.status,
        error,
        updatedAt: now,
      })
      .where(eq(merchOrders.id, existingOrder.id));
    await db
      .update(merchPayoutLedgerEntries)
      .set({
        payoutStatus: 'held_for_refund_window',
        metadata: drizzleSql`${merchPayoutLedgerEntries.metadata} || ${JSON.stringify(
          {
            partialRefund: {
              chargeId: charge.id,
              amountRefundedCents,
              amountCents,
            },
          }
        )}::jsonb`,
        updatedAt: now,
      })
      .where(
        and(
          eq(merchPayoutLedgerEntries.merchOrderId, existingOrder.id),
          ne(merchPayoutLedgerEntries.payoutStatus, 'paid_manually'),
          ne(merchPayoutLedgerEntries.payoutStatus, 'reversed')
        )
      );
    return;
  }

  const [order] = await db
    .update(merchOrders)
    .set({ status: 'refunded', refundedAt: new Date(), updatedAt: new Date() })
    .where(eq(merchOrders.id, existingOrder.id))
    .returning();

  if (!order) return;

  const [reversedLedger] = await db
    .update(merchPayoutLedgerEntries)
    .set({
      payoutStatus: 'reversed',
      reversedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(merchPayoutLedgerEntries.merchOrderId, order.id),
        ne(merchPayoutLedgerEntries.payoutStatus, 'reversed')
      )
    )
    .returning({
      artistShareCents: merchPayoutLedgerEntries.artistShareCents,
      jovieShareCents: merchPayoutLedgerEntries.jovieShareCents,
    });

  if (reversedLedger) {
    await db
      .update(merchCards)
      .set({
        purchases: drizzleSql`GREATEST(${merchCards.purchases} - ${order.quantity}, 0)`,
        grossRevenueCents: drizzleSql`GREATEST(${merchCards.grossRevenueCents} - ${order.subtotalCents}, 0)`,
        grossMarginCents: drizzleSql`GREATEST(${merchCards.grossMarginCents} - ${reversedLedger.jovieShareCents}, 0)`,
        artistPayoutAccruedCents: drizzleSql`GREATEST(${merchCards.artistPayoutAccruedCents} - ${reversedLedger.artistShareCents}, 0)`,
        updatedAt: new Date(),
      })
      .where(eq(merchCards.id, order.merchCardId));
    await refreshMerchRank(order.merchCardId);
  }
}

export async function fulfillMerchOrder(orderId: string): Promise<void> {
  const row = await getOrderWithCard(orderId);
  if (!row) throw new Error('Merch order not found');

  const retryableStatuses: ReadonlySet<MerchOrder['status']> = new Set([
    'paid',
    'paid_fulfillment_hold',
    'paid_fulfillment_failed',
  ]);
  if (!retryableStatuses.has(row.order.status)) {
    if (row.order.status === 'checkout_created') {
      await db
        .update(merchOrders)
        .set({
          status: 'paid_fulfillment_hold',
          error: `Order status ${row.order.status} is not fulfillment-ready`,
          updatedAt: new Date(),
        })
        .where(eq(merchOrders.id, orderId));
    }
    throw new Error(`Merch order ${orderId} is not fulfillment-ready`);
  }

  try {
    assertMerchCardCheckoutSellable(row.card);
    assertMerchOrderSellable(row.order);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    await db
      .update(merchOrders)
      .set({
        status: 'paid_fulfillment_hold',
        error: message,
        updatedAt: new Date(),
      })
      .where(eq(merchOrders.id, orderId));
    throw error;
  }

  if (!isPrintfulConfigured()) {
    await db
      .update(merchOrders)
      .set({
        status: 'paid_fulfillment_hold',
        error: 'Printful is not configured',
        updatedAt: new Date(),
      })
      .where(eq(merchOrders.id, orderId));
    throw new Error('Printful is not configured');
  }

  if (!validateShippingAddress(row.order.shippingAddress)) {
    await db
      .update(merchOrders)
      .set({
        status: 'paid_fulfillment_hold',
        error: 'Order is missing a complete shipping address',
        updatedAt: new Date(),
      })
      .where(eq(merchOrders.id, orderId));
    throw new Error('Order is missing a complete shipping address');
  }

  const draft = await createDraftOrder(
    buildPrintfulOrderInput({
      order: row.order,
      card: row.card,
      fulfillment: {
        shippingAddress: row.order.shippingAddress,
        buyerEmail: row.order.buyerEmail,
        buyerName: row.order.buyerName,
      },
    })
  );

  await db
    .update(merchOrders)
    .set({
      status: 'printful_draft_created',
      printfulOrderId: String(draft.id),
      printfulStatus: draft.status ?? null,
      updatedAt: new Date(),
    })
    .where(eq(merchOrders.id, orderId));

  const confirmed = await confirmOrder(draft.id);
  await db
    .update(merchOrders)
    .set({
      status: 'submitted_to_printful',
      printfulOrderId: String(confirmed.id),
      printfulStatus: confirmed.status ?? null,
      updatedAt: new Date(),
      fulfilledAt: new Date(),
    })
    .where(eq(merchOrders.id, orderId));
}

export async function processMerchFulfillmentJobs(limit = 5): Promise<{
  readonly processed: number;
  readonly succeeded: number;
  readonly failed: number;
}> {
  const now = new Date();
  const claimableJobs = db
    .select({ id: merchFulfillmentJobs.id })
    .from(merchFulfillmentJobs)
    .where(
      and(
        drizzleSql`${merchFulfillmentJobs.status} IN ('queued', 'failed')`,
        drizzleSql`${merchFulfillmentJobs.nextRunAt} <= ${now}`
      )
    )
    .orderBy(asc(merchFulfillmentJobs.nextRunAt))
    .limit(limit);

  const jobs = await db
    .update(merchFulfillmentJobs)
    .set({
      status: 'running',
      attempts: drizzleSql`${merchFulfillmentJobs.attempts} + 1`,
      lockedAt: now,
      lockedBy: 'process-merch-fulfillment',
      updatedAt: now,
    })
    .where(
      and(
        inArray(merchFulfillmentJobs.id, claimableJobs),
        drizzleSql`${merchFulfillmentJobs.status} IN ('queued', 'failed')`,
        drizzleSql`${merchFulfillmentJobs.nextRunAt} <= ${now}`
      )
    )
    .returning();

  let succeeded = 0;
  let failed = 0;

  for (const job of jobs) {
    const attempts = job.attempts;

    try {
      await fulfillMerchOrder(job.merchOrderId);
      await db
        .update(merchFulfillmentJobs)
        .set({
          status: 'succeeded',
          completedAt: new Date(),
          updatedAt: new Date(),
          lastError: null,
        })
        .where(eq(merchFulfillmentJobs.id, job.id));
      succeeded++;
    } catch (error) {
      const lastError =
        error instanceof Error ? error.message : 'Unknown error';
      const blocked = attempts >= MAX_FULFILLMENT_ATTEMPTS;
      await db
        .update(merchFulfillmentJobs)
        .set({
          status: blocked ? 'blocked' : 'failed',
          attempts,
          nextRunAt: new Date(Date.now() + attempts * 15 * 60_000),
          lastError,
          updatedAt: new Date(),
        })
        .where(eq(merchFulfillmentJobs.id, job.id));
      await db
        .update(merchOrders)
        .set({
          status: blocked ? 'paid_fulfillment_failed' : 'paid_fulfillment_hold',
          error: lastError,
          updatedAt: new Date(),
        })
        .where(eq(merchOrders.id, job.merchOrderId));
      failed++;
    }
  }

  return { processed: jobs.length, succeeded, failed };
}

function resolvePrintfulOrderEventStatus(params: {
  readonly eventType?: string;
  readonly orderStatus?: string;
}): MerchOrder['status'] {
  switch (params.eventType) {
    case 'shipment_sent':
      return 'shipped';
    case 'shipment_delivered':
      return 'delivered';
    case 'order_canceled':
      return 'cancelled';
    default:
      return params.orderStatus === 'failed' ? 'failed' : 'fulfilling';
  }
}

export async function handlePrintfulOrderEvent(
  payload: unknown
): Promise<void> {
  const event = payload as {
    type?: string;
    data?: {
      order?: { id?: number; external_id?: string | null; status?: string };
    };
  };
  const orderPayload = event.data?.order;
  if (!orderPayload?.id && !orderPayload?.external_id) return;

  const status = resolvePrintfulOrderEventStatus({
    eventType: event.type,
    orderStatus: orderPayload.status,
  });

  const conditions = orderPayload.external_id
    ? eq(merchOrders.printfulExternalId, orderPayload.external_id)
    : eq(merchOrders.printfulOrderId, String(orderPayload.id));

  const nextValues = {
    status,
    printfulStatus: orderPayload.status ?? null,
    updatedAt: new Date(),
    ...(orderPayload.id ? { printfulOrderId: String(orderPayload.id) } : {}),
    ...(status === 'shipped' ? { shippedAt: new Date() } : {}),
    ...(status === 'delivered' ? { deliveredAt: new Date() } : {}),
  };

  await db.update(merchOrders).set(nextValues).where(conditions);
}
