import 'server-only';

import crypto from 'node:crypto';
import { and, desc, sql as drizzleSql, eq, gt, isNull, or } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import {
  type LeadFunnelEventMetadata,
  leadFunnelEvents,
  leads,
} from '@/lib/db/schema/leads';
import { env, isSecureEnv } from '@/lib/env-server';
import { captureError } from '@/lib/error-tracking';
import { hashClaimToken } from '@/lib/security/claim-token';

const LEAD_ATTRIBUTION_COOKIE = 'jovie_lead_attribution';
const LEAD_ATTRIBUTION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const LEAD_ATTRIBUTION_SECRET_DOMAIN = 'lead-attribution-cookie';

export interface LeadAttributionCookiePayload {
  leadId: string;
  channel: string | null;
  provider: string | null;
  campaignKey: string | null;
  variantKey: string | null;
  contactAttemptId: string | null;
  issuedAt: number;
  expiresAt: number;
}

export interface RecordLeadFunnelEventInput {
  leadId: string;
  eventType: string;
  channel?: string | null;
  provider?: string | null;
  campaignKey?: string | null;
  variantKey?: string | null;
  metadata?: LeadFunnelEventMetadata;
  occurredAt?: Date;
}

function getLeadAttributionSecret(): string {
  const secret = env.LEAD_ATTRIBUTION_SECRET ?? env.URL_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error(
      'LEAD_ATTRIBUTION_SECRET or URL_ENCRYPTION_KEY must be configured for lead attribution'
    );
  }

  return crypto
    .createHmac('sha256', secret)
    .update(LEAD_ATTRIBUTION_SECRET_DOMAIN)
    .digest('hex');
}

function signPayload(payload: string): string {
  return crypto
    .createHmac('sha256', getLeadAttributionSecret())
    .update(payload)
    .digest('hex');
}

function serializeLeadAttribution(
  payload: LeadAttributionCookiePayload
): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${signPayload(body)}`;
}

function parseLeadAttributionCookie(
  value: string
): LeadAttributionCookiePayload | null {
  const [body, signature] = value.split('.');
  if (!body || !signature) return null;

  const expected = signPayload(body);
  const signatureBuffer = Buffer.from(signature, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');

  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return null;
  }

  const parsed = JSON.parse(
    Buffer.from(body, 'base64url').toString('utf8')
  ) as LeadAttributionCookiePayload;

  if (!parsed?.leadId || typeof parsed.expiresAt !== 'number') {
    return null;
  }

  if (parsed.expiresAt <= Date.now()) {
    return null;
  }

  return parsed;
}

export async function setLeadAttributionCookie(
  payload: Omit<LeadAttributionCookiePayload, 'issuedAt' | 'expiresAt'>
): Promise<void> {
  const now = Date.now();
  const cookieStore = await cookies();
  const value = serializeLeadAttribution({
    ...payload,
    issuedAt: now,
    expiresAt: now + LEAD_ATTRIBUTION_TTL_MS,
  });

  cookieStore.set(LEAD_ATTRIBUTION_COOKIE, value, {
    httpOnly: true,
    secure: isSecureEnv(),
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(LEAD_ATTRIBUTION_TTL_MS / 1000),
  });
}

export async function clearLeadAttributionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(LEAD_ATTRIBUTION_COOKIE);
}

export async function getLeadAttributionCookie(): Promise<LeadAttributionCookiePayload | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(LEAD_ATTRIBUTION_COOKIE)?.value;
  if (!raw) return null;

  try {
    return parseLeadAttributionCookie(raw);
  } catch (error) {
    await captureError('Failed to parse lead attribution cookie', error, {
      route: 'lib/leads/funnel-events',
    });
    return null;
  }
}

export async function recordLeadFunnelEvent(
  input: RecordLeadFunnelEventInput,
  options?: { idempotent?: boolean }
): Promise<void> {
  try {
    if (typeof db.insert !== 'function') {
      return;
    }
    const insertQuery = db.insert(leadFunnelEvents).values({
      leadId: input.leadId,
      eventType: input.eventType,
      channel: input.channel ?? null,
      provider: input.provider ?? null,
      campaignKey: input.campaignKey ?? null,
      variantKey: input.variantKey ?? null,
      metadata: input.metadata,
      occurredAt: input.occurredAt ?? new Date(),
    });

    if (options?.idempotent) {
      await insertQuery.onConflictDoNothing({
        target: [leadFunnelEvents.leadId, leadFunnelEvents.eventType],
      });
      return;
    }

    await insertQuery;
  } catch (error) {
    await captureError('Failed to record lead funnel event', error, {
      route: 'lib/leads/funnel-events',
      contextData: {
        leadId: input.leadId,
        eventType: input.eventType,
      },
    });
  }
}

export async function lookupLeadByClaimToken(token: string): Promise<{
  id: string;
  outreachRoute: string | null;
  outreachStatus: string | null;
  instantlyLeadId: string | null;
} | null> {
  const tokenHash = await hashClaimToken(token);
  const now = new Date();

  const [lead] = await db
    .select({
      id: leads.id,
      outreachRoute: leads.outreachRoute,
      outreachStatus: leads.outreachStatus,
      instantlyLeadId: leads.instantlyLeadId,
    })
    .from(leads)
    .where(
      and(
        or(eq(leads.claimToken, token), eq(leads.claimTokenHash, tokenHash)),
        or(
          isNull(leads.claimTokenExpiresAt),
          gt(leads.claimTokenExpiresAt, now)
        )
      )
    )
    .orderBy(desc(leads.updatedAt))
    .limit(1);

  return lead ?? null;
}

function getAttributedChannel(lead: {
  outreachRoute: string | null;
  outreachStatus: string | null;
}): string | null {
  if (lead.outreachStatus === 'dm_sent') return 'dm';
  if (lead.outreachRoute === 'dm') return 'dm';
  if (lead.outreachRoute === 'manual_review') return 'manual_review';
  if (lead.outreachRoute) return 'email';
  return null;
}

export async function markLeadClaimPageViewedFromToken(
  token: string
): Promise<void> {
  const lead = await lookupLeadByClaimToken(token);
  if (!lead) return;

  await recordLeadFunnelEvent(
    {
      leadId: lead.id,
      eventType: 'claim_page_viewed',
      channel: getAttributedChannel(lead),
      provider: lead.instantlyLeadId ? 'instantly' : null,
      campaignKey: 'claim_invite',
    },
    { idempotent: false }
  );
}

export async function setLeadAttributionCookieFromToken(
  token: string
): Promise<void> {
  const lead = await lookupLeadByClaimToken(token);
  if (!lead) return;

  await setLeadAttributionCookie({
    leadId: lead.id,
    channel: getAttributedChannel(lead),
    provider: lead.instantlyLeadId ? 'instantly' : null,
    campaignKey: 'claim_invite',
    variantKey: null,
    contactAttemptId: lead.instantlyLeadId,
  });
}

export async function attributeLeadSignupFromClerkUserId(
  clerkUserId: string
): Promise<{ leadId: string | null; userId: string | null }> {
  const attribution = await getLeadAttributionCookie();
  if (!attribution) {
    return { leadId: null, userId: null };
  }

  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkId, clerkUserId))
    .limit(1);

  if (!user) {
    return { leadId: attribution.leadId, userId: null };
  }

  const [lead] = await db
    .select({
      id: leads.id,
      signupUserId: leads.signupUserId,
      signupAt: leads.signupAt,
      paidAt: leads.paidAt,
    })
    .from(leads)
    .where(eq(leads.id, attribution.leadId))
    .limit(1);

  if (!lead || (lead.signupUserId && lead.signupUserId !== user.id)) {
    return { leadId: attribution.leadId, userId: user.id };
  }

  const now = new Date();
  await db
    .update(leads)
    .set({
      signupUserId: user.id,
      signupAt: lead.signupAt ?? now,
      attributionStatus: 'attributed',
      updatedAt: now,
    })
    .where(eq(leads.id, lead.id));

  await recordLeadFunnelEvent(
    {
      leadId: lead.id,
      eventType: 'signup_completed',
      channel: attribution.channel,
      provider: attribution.provider,
      campaignKey: attribution.campaignKey,
      variantKey: attribution.variantKey,
      metadata: {
        contactAttemptId: attribution.contactAttemptId,
        signupUserId: user.id,
      },
    },
    { idempotent: true }
  );

  await recordLeadFunnelEvent(
    {
      leadId: lead.id,
      eventType: 'onboarding_completed',
      channel: attribution.channel,
      provider: attribution.provider,
      campaignKey: attribution.campaignKey,
      variantKey: attribution.variantKey,
      metadata: {
        contactAttemptId: attribution.contactAttemptId,
        signupUserId: user.id,
      },
    },
    { idempotent: true }
  );

  await clearLeadAttributionCookie();

  return { leadId: lead.id, userId: user.id };
}

export async function attributeLeadPaidConversionByClerkUserId(
  clerkUserId: string,
  subscriptionId: string
): Promise<void> {
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkId, clerkUserId))
    .limit(1);

  if (!user) return;

  const [lead] = await db
    .select({
      id: leads.id,
      paidAt: leads.paidAt,
      paidSubscriptionId: leads.paidSubscriptionId,
    })
    .from(leads)
    .where(eq(leads.signupUserId, user.id))
    .limit(1);

  if (!lead || lead.paidAt) {
    return;
  }

  const now = new Date();
  await db
    .update(leads)
    .set({
      paidAt: now,
      paidSubscriptionId: subscriptionId,
      updatedAt: now,
    })
    .where(eq(leads.id, lead.id));

  await recordLeadFunnelEvent(
    {
      leadId: lead.id,
      eventType: 'paid_converted',
      metadata: {
        signupUserId: user.id,
        stripeSubscriptionId: subscriptionId,
      },
    },
    { idempotent: true }
  );
}

export async function countLeadEventsSince(
  eventTypes: string[],
  since: Date
): Promise<number> {
  if (eventTypes.length === 0) return 0;

  const result = await db.execute<{ count: number }>(drizzleSql`
    select count(*)::int as count
    from ${leadFunnelEvents}
    where ${leadFunnelEvents.eventType} = any(${eventTypes})
      and ${leadFunnelEvents.occurredAt} >= ${since}
  `);

  return Number(result.rows[0]?.count ?? 0);
}
