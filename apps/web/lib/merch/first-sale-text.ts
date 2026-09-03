import 'server-only';

import { and, sql as drizzleSql, eq, inArray, ne } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { baUsers } from '@/lib/db/schema/better-auth';
import { type MerchOrder, merchOrders } from '@/lib/db/schema/merch';
import { creatorProfiles, userProfileClaims } from '@/lib/db/schema/profiles';
import { env } from '@/lib/env-server';
import { captureError } from '@/lib/error-tracking';
import { sendNotification } from '@/lib/notifications/service';
import { logger } from '@/lib/utils/logger';

/**
 * Single source for the first-sale SMS. Swap this string; keep it short.
 * No emoji keeps this in one GSM-7 segment.
 */
export const FIRST_SALE_TEXT_COPY = {
  body: "Guess who just got their first sale. Who's a rockstar.",
} as const;

const FIRST_SALE_SETTINGS_KEY = 'firstSaleText';
const E164_PHONE = /^\+[1-9]\d{7,14}$/;

/** Any successful merch order that means the artist already had a sale. */
export const PRIOR_SALE_STATUSES = [
  'paid',
  'paid_fulfillment_hold',
  'paid_fulfillment_failed',
  'printful_draft_created',
  'submitted_to_printful',
  'fulfilling',
  'shipped',
  'delivered',
] as const satisfies ReadonlyArray<MerchOrder['status']>;

export type FirstSaleTextOutcome =
  | 'not_first_sale'
  | 'already_claimed'
  | 'dry_run'
  | 'skipped_no_phone'
  | 'sent'
  | 'send_failed';

export interface FirstSaleTextInput {
  readonly creatorProfileId: string;
  readonly merchOrderId: string;
}

export interface FirstSaleTextResult {
  readonly outcome: FirstSaleTextOutcome;
}

export interface FirstSaleTextDeps {
  readonly isLive: () => boolean;
  readonly findPriorPaidSale: (
    creatorProfileId: string,
    merchOrderId: string
  ) => Promise<string | null>;
  readonly claimFirstSale: (input: FirstSaleTextInput) => Promise<boolean>;
  readonly resolveArtistPhone: (
    creatorProfileId: string
  ) => Promise<string | null>;
  readonly sendSms: (params: {
    readonly creatorProfileId: string;
    readonly merchOrderId: string;
    readonly phone: string;
    readonly body: string;
  }) => Promise<boolean>;
}

function isTruthyFlag(value: string | undefined): boolean {
  return value === 'true' || value === '1';
}

/** Live send is off unless FIRST_SALE_TEXT_LIVE is explicitly true. */
export function isFirstSaleTextLive(): boolean {
  return isTruthyFlag(env.FIRST_SALE_TEXT_LIVE);
}

export function isPriorMerchSaleStatus(status: MerchOrder['status']): boolean {
  return (PRIOR_SALE_STATUSES as readonly string[]).includes(status);
}

export async function findPriorPaidSale(
  creatorProfileId: string,
  merchOrderId: string
): Promise<string | null> {
  const [row] = await db
    .select({ id: merchOrders.id })
    .from(merchOrders)
    .where(
      and(
        eq(merchOrders.creatorProfileId, creatorProfileId),
        ne(merchOrders.id, merchOrderId),
        inArray(merchOrders.status, PRIOR_SALE_STATUSES)
      )
    )
    .limit(1);

  return row?.id ?? null;
}

export async function claimFirstSale(
  input: FirstSaleTextInput
): Promise<boolean> {
  const claimedAt = new Date();
  const payload = JSON.stringify({
    merchOrderId: input.merchOrderId,
    claimedAt: claimedAt.toISOString(),
    status: 'claimed',
  });

  const [claimed] = await db
    .update(creatorProfiles)
    .set({
      settings: drizzleSql`jsonb_set(
        COALESCE(${creatorProfiles.settings}, '{}'::jsonb),
        '{firstSaleText}',
        ${payload}::jsonb
      )`,
      updatedAt: claimedAt,
    })
    .where(
      and(
        eq(creatorProfiles.id, input.creatorProfileId),
        drizzleSql`COALESCE(${creatorProfiles.settings}->${FIRST_SALE_SETTINGS_KEY}, 'null'::jsonb) = 'null'::jsonb`
      )
    )
    .returning({ id: creatorProfiles.id });

  return Boolean(claimed);
}

function normalizePhone(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  if (!E164_PHONE.test(trimmed)) return null;
  return trimmed;
}

export async function resolveArtistPhone(
  creatorProfileId: string
): Promise<string | null> {
  const [owned] = await db
    .select({ phone: baUsers.phoneNumber })
    .from(userProfileClaims)
    .innerJoin(users, eq(users.id, userProfileClaims.userId))
    .innerJoin(baUsers, eq(baUsers.id, users.betterAuthUserId))
    .where(
      and(
        eq(userProfileClaims.creatorProfileId, creatorProfileId),
        eq(userProfileClaims.role, 'owner')
      )
    )
    .limit(1);

  const ownedPhone = normalizePhone(owned?.phone);
  if (ownedPhone) return ownedPhone;

  const [legacy] = await db
    .select({ phone: baUsers.phoneNumber })
    .from(creatorProfiles)
    .innerJoin(users, eq(users.id, creatorProfiles.userId))
    .innerJoin(baUsers, eq(baUsers.id, users.betterAuthUserId))
    .where(eq(creatorProfiles.id, creatorProfileId))
    .limit(1);

  return normalizePhone(legacy?.phone);
}

async function sendFirstSaleSms(params: {
  readonly creatorProfileId: string;
  readonly merchOrderId: string;
  readonly phone: string;
  readonly body: string;
}): Promise<boolean> {
  const result = await sendNotification(
    {
      id: `first-sale-text:${params.creatorProfileId}`,
      dedupKey: `first-sale-text:${params.creatorProfileId}`,
      category: 'product',
      subject: 'First sale',
      text: params.body,
      channels: ['sms'],
      dismissible: false,
      metadata: {
        source: 'first_sale_text',
        merchOrderId: params.merchOrderId,
      },
    },
    {
      phone: params.phone,
      creatorProfileId: params.creatorProfileId,
      preferences: {
        channels: {
          sms: true,
          email: false,
          push: false,
          in_app: false,
        },
      },
    }
  );

  return result.delivered.includes('sms');
}

export const productionFirstSaleTextDeps: FirstSaleTextDeps = {
  isLive: isFirstSaleTextLive,
  findPriorPaidSale,
  claimFirstSale,
  resolveArtistPhone,
  sendSms: sendFirstSaleSms,
};

/**
 * First paid merch sale for this artist means one celebratory SMS, forever.
 * Claims before send so webhook retries cannot double-text.
 */
export async function maybeNotifyFirstMerchSale(
  input: FirstSaleTextInput,
  deps: FirstSaleTextDeps = productionFirstSaleTextDeps
): Promise<FirstSaleTextResult> {
  const priorSaleId = await deps.findPriorPaidSale(
    input.creatorProfileId,
    input.merchOrderId
  );
  if (priorSaleId) {
    return { outcome: 'not_first_sale' };
  }

  const claimed = await deps.claimFirstSale(input);
  if (!claimed) {
    return { outcome: 'already_claimed' };
  }

  if (!deps.isLive()) {
    logger.info('[merch] First-sale text dry-run (FIRST_SALE_TEXT_LIVE off)', {
      merchOrderId: input.merchOrderId,
    });
    return { outcome: 'dry_run' };
  }

  const phone = await deps.resolveArtistPhone(input.creatorProfileId);
  if (!phone) {
    logger.info('[merch] First-sale text skipped because artist has no phone', {
      merchOrderId: input.merchOrderId,
    });
    return { outcome: 'skipped_no_phone' };
  }

  const sent = await deps.sendSms({
    creatorProfileId: input.creatorProfileId,
    merchOrderId: input.merchOrderId,
    phone,
    body: FIRST_SALE_TEXT_COPY.body,
  });

  if (!sent) {
    logger.warn('[merch] First-sale text did not deliver', {
      merchOrderId: input.merchOrderId,
    });
    return { outcome: 'send_failed' };
  }

  logger.info('[merch] First-sale text sent', {
    merchOrderId: input.merchOrderId,
  });
  return { outcome: 'sent' };
}

/** Never fail merch checkout if the celebration path throws. */
export async function notifyFirstMerchSaleBestEffort(
  input: FirstSaleTextInput
): Promise<void> {
  try {
    await maybeNotifyFirstMerchSale(input);
  } catch (error) {
    logger.error('[merch] First-sale text failed', {
      error,
      merchOrderId: input.merchOrderId,
    });
    await captureError('First-sale text failed', error, {
      route: 'merch/first-sale-text',
      merchOrderId: input.merchOrderId,
    });
  }
}
