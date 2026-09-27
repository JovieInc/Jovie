import 'server-only';

import * as Sentry from '@sentry/nextjs';
import { identifyUser } from '@/lib/analytics/runtime-aware';
import { db } from '@/lib/db';
import { serverAnalyticsEvents } from '@/lib/db/schema/analytics';
import { withTimeout } from '@/lib/resilience/primitives';

export const SERVER_ANALYTICS_CONTRACT_VERSION = 'server-analytics/v1';
export const SERVER_ANALYTICS_DELIVERY_TIMEOUT_MS = 2_000;
export const SERVER_ANALYTICS_PRIVACY_CLASS =
  'pseudonymous_ids_no_contact_data';
/**
 * These rows measure server-verified first-party operations without cookies,
 * contact data, raw user ids, or cross-session visitor identity. UUID source
 * ids are pseudonymous and expire through the canonical analytics-retention
 * job. Client-side behavioral analytics uses the separate cookie-consent flow.
 */
export const SERVER_ANALYTICS_CONSENT_POLICY =
  'first_party_operational_measurement';

type SourceEntityType = 'creator_profile' | 'release' | 'tour_date';

interface ServerAnalyticsEventDefinition {
  readonly category:
    | 'auth'
    | 'profile'
    | 'release'
    | 'tour'
    | 'notification'
    | 'entitlement'
    | 'billing';
  readonly properties: readonly string[];
  readonly source?: {
    readonly property: string;
    readonly type: SourceEntityType;
  };
}

const authEvent = {
  category: 'auth',
  properties: ['client', 'intent', 'result', 'reason'],
} as const satisfies ServerAnalyticsEventDefinition;

const notificationProperties = [
  'artist_id',
  'channel',
  'email_length',
  'phone_length',
  'error_type',
  'phone_present',
  'country_code',
  'creator_is_pro',
  'dynamic_enabled',
  'method',
] as const;

const notificationEvent = {
  category: 'notification',
  properties: notificationProperties,
} as const satisfies ServerAnalyticsEventDefinition;

export const SERVER_ANALYTICS_EVENTS = {
  auth_started: authEvent,
  auth_provider_opened: authEvent,
  auth_callback_received: authEvent,
  auth_exchange_succeeded: authEvent,
  auth_exchange_failed: authEvent,
  auth_returned_to_client: authEvent,
  auth_wrong_surface_prevented: authEvent,
  /**
   * Canonical self-serve activation receipt. Emitted once per owned profile
   * from completeOnboarding, keyed by profile id so refresh/multi-tab/multi-
   * device replays collapse to one durable row.
   */
  onboarding_completed: {
    category: 'profile',
    properties: ['profileId'],
    source: { property: 'profileId', type: 'creator_profile' },
  },
  /**
   * Checkout session creation is the server-side checkout start. Stripe
   * checkout session ids are not persisted; the idempotency key is a hash.
   */
  checkout_initiated: {
    category: 'billing',
    properties: ['plan'],
  },
  /**
   * Verified subscription payment emitted from the invoice.payment_succeeded
   * webhook handler, keyed by the Stripe event id so webhook retries dedupe.
   */
  payment_succeeded: {
    category: 'billing',
    properties: ['appUserId', 'billing_reason'],
  },
  subscription_renewed: {
    category: 'billing',
    properties: ['appUserId', 'billing_reason'],
  },
  subscription_churned: {
    category: 'billing',
    properties: ['appUserId'],
  },
  dashboard_profile_updated: {
    category: 'profile',
    properties: ['profileId'],
    source: { property: 'profileId', type: 'creator_profile' },
  },
  releases_synced: {
    category: 'release',
    properties: ['profileId', 'imported', 'source', 'isInitialConnect'],
    source: { property: 'profileId', type: 'creator_profile' },
  },
  release_isrc_rescan: {
    category: 'release',
    properties: ['profileId', 'releaseId', 'linksFound'],
    source: { property: 'releaseId', type: 'release' },
  },
  apple_music_rescan: {
    category: 'release',
    properties: ['profileId', 'linksFound'],
    source: { property: 'profileId', type: 'creator_profile' },
  },
  release_archived: {
    category: 'release',
    properties: ['profileId', 'releaseId'],
    source: { property: 'releaseId', type: 'release' },
  },
  release_deleted: {
    category: 'release',
    properties: ['profileId', 'releaseId'],
    source: { property: 'profileId', type: 'creator_profile' },
  },
  release_restored: {
    category: 'release',
    properties: ['profileId', 'releaseId'],
    source: { property: 'releaseId', type: 'release' },
  },
  smart_link_clicked: {
    category: 'release',
    properties: [
      'profileId',
      'releaseId',
      'provider',
      'utm_source',
      'utm_medium',
      'utm_content',
      'utm_campaign_matches_release',
    ],
    source: { property: 'releaseId', type: 'release' },
  },
  bandsintown_api_key_saved: {
    category: 'tour',
    properties: ['profileId'],
    source: { property: 'profileId', type: 'creator_profile' },
  },
  bandsintown_api_key_removed: {
    category: 'tour',
    properties: ['profileId'],
    source: { property: 'profileId', type: 'creator_profile' },
  },
  tour_dates_synced: {
    category: 'tour',
    properties: ['profileId', 'synced', 'source', 'isInitialConnect'],
    source: { property: 'profileId', type: 'creator_profile' },
  },
  tour_date_created: {
    category: 'tour',
    properties: ['profileId', 'tourDateId', 'source'],
    source: { property: 'tourDateId', type: 'tour_date' },
  },
  tour_date_deleted: {
    category: 'tour',
    properties: ['profileId', 'tourDateId'],
    source: { property: 'profileId', type: 'creator_profile' },
  },
  event_confirmed: {
    category: 'tour',
    properties: ['profileId', 'eventId'],
    source: { property: 'eventId', type: 'tour_date' },
  },
  event_rejected: {
    category: 'tour',
    properties: ['profileId', 'eventId'],
    source: { property: 'eventId', type: 'tour_date' },
  },
  event_reject_undone: {
    category: 'tour',
    properties: ['profileId', 'eventId'],
    source: { property: 'eventId', type: 'tour_date' },
  },
  events_confirmed_bulk: {
    category: 'tour',
    properties: ['profileId', 'requested', 'updated'],
    source: { property: 'profileId', type: 'creator_profile' },
  },
  events_rejected_bulk: {
    category: 'tour',
    properties: ['profileId', 'requested', 'updated'],
    source: { property: 'profileId', type: 'creator_profile' },
  },
  notifications_subscribe_attempt: notificationEvent,
  notifications_subscribe_error: notificationEvent,
  notifications_subscribe_success: notificationEvent,
  notifications_unsubscribe_attempt: notificationEvent,
  notifications_unsubscribe_error: notificationEvent,
  notifications_unsubscribe_success: notificationEvent,
  entitlement_denial: {
    category: 'entitlement',
    properties: ['gate', 'source', 'toolName', 'code', 'planRequired'],
  },
} as const satisfies Record<string, ServerAnalyticsEventDefinition>;

export type ServerAnalyticsEventName = keyof typeof SERVER_ANALYTICS_EVENTS;

export const SERVER_ANALYTICS_CALLSITE_INVENTORY = [
  {
    path: 'app/api/auth/native/exchange/route.ts',
    invocations: 1,
    events: ['auth_exchange_succeeded', 'auth_exchange_failed'],
  },
  {
    path: 'app/api/dashboard/profile/lib/response.ts',
    invocations: 1,
    events: ['dashboard_profile_updated'],
  },
  {
    path: 'app/app/(shell)/dashboard/releases/actions.ts',
    invocations: 7,
    events: [
      'release_isrc_rescan',
      'apple_music_rescan',
      'releases_synced',
      'release_archived',
      'release_deleted',
      'release_restored',
    ],
  },
  {
    path: 'app/app/(shell)/dashboard/tour-dates/actions.ts',
    invocations: 6,
    events: [
      'bandsintown_api_key_saved',
      'bandsintown_api_key_removed',
      'tour_dates_synced',
      'tour_date_created',
      'tour_date_deleted',
    ],
  },
  {
    path: 'app/app/(shell)/dashboard/tour-dates/events-actions.ts',
    invocations: 2,
    events: [
      'event_confirmed',
      'event_rejected',
      'event_reject_undone',
      'events_confirmed_bulk',
      'events_rejected_bulk',
    ],
  },
  {
    path: 'app/auth/callback/route.ts',
    invocations: 1,
    events: ['auth_callback_received', 'auth_returned_to_client'],
  },
  {
    path: 'app/auth/start/route.ts',
    invocations: 1,
    events: [
      'auth_started',
      'auth_provider_opened',
      'auth_wrong_surface_prevented',
    ],
  },
  {
    path: 'app/onboarding/actions/connect-spotify.ts',
    invocations: 1,
    events: ['releases_synced'],
  },
  {
    path: 'app/r/[slug]/page.tsx',
    invocations: 1,
    events: ['smart_link_clicked'],
  },
  {
    path: 'lib/leads/funnel-events.ts',
    invocations: 1,
    events: ['onboarding_completed'],
  },
  {
    path: 'lib/stripe/client.ts',
    invocations: 1,
    events: ['checkout_initiated'],
  },
  {
    path: 'lib/stripe/webhooks/handlers/payment-handler.ts',
    invocations: 2,
    events: ['payment_succeeded', 'subscription_renewed'],
  },
  {
    path: 'lib/stripe/webhooks/handlers/subscription-handler.ts',
    invocations: 1,
    events: ['subscription_churned'],
  },
  {
    path: 'lib/notifications/analytics.ts',
    invocations: 7,
    events: [
      'notifications_subscribe_attempt',
      'notifications_subscribe_error',
      'notifications_subscribe_success',
      'notifications_unsubscribe_attempt',
      'notifications_unsubscribe_error',
      'notifications_unsubscribe_success',
    ],
  },
  {
    path: 'lib/entitlements/demand-signal.ts',
    invocations: 1,
    events: ['entitlement_denial'],
  },
] as const satisfies ReadonlyArray<{
  readonly path: string;
  readonly invocations: number;
  readonly events: readonly ServerAnalyticsEventName[];
}>;

type SafePropertyValue = string | number | boolean | null;

const UUID_PROPERTY_NAMES = new Set([
  'appUserId',
  'artist_id',
  'eventId',
  'profileId',
  'releaseId',
  'tourDateId',
]);
const SAFE_TOKEN_PROPERTY_NAMES = new Set([
  'code',
  'error_type',
  'gate',
  'plan',
  'planRequired',
  'provider',
  'reason',
  'result',
  'source',
  'toolName',
]);
const ENUM_PROPERTY_VALUES: Readonly<Record<string, ReadonlySet<string>>> = {
  // Stripe invoice.billing_reason enum; subscription_cycle marks renewals.
  billing_reason: new Set([
    'automatic_pending_invoice_item_invoice',
    'manual',
    'quote_accept',
    'subscription',
    'subscription_create',
    'subscription_cycle',
    'subscription_threshold',
    'subscription_update',
    'upcoming',
  ]),
  channel: new Set(['email', 'sms']),
  client: new Set(['web', 'ios', 'electron']),
  intent: new Set(['sign_in', 'sign_up']),
  method: new Set(['email_link', 'dashboard', 'api', 'dropdown']),
};
const UTM_PROPERTY_VALUES: Readonly<Record<string, ReadonlySet<string>>> = {
  utm_source: new Set([
    'apple_music',
    'bandcamp',
    'blog',
    'collab',
    'discord',
    'email_blast',
    'epk',
    'facebook',
    'google',
    'influencer',
    'instagram',
    'jovie',
    'label',
    'linkedin',
    'linktree',
    'live_show',
    'merch',
    'meta',
    'newsletter',
    'playlist_pitch',
    'podcast',
    'pr',
    'qr_code',
    'radio',
    'reddit',
    'referral',
    'sms',
    'snapchat',
    'soundcloud',
    'spotify',
    'threads',
    'tiktok',
    'twitter',
    'website',
    'youtube',
  ]),
  utm_medium: new Set([
    'ad',
    'announcement',
    'audio',
    'banner',
    'bio_link',
    'cpc',
    'digital',
    'discovery_mode',
    'email',
    'insert',
    'interview',
    'marquee',
    'organic',
    'paid',
    'paid_social',
    'paid_video',
    'partner',
    'popup',
    'press',
    'print',
    'profile',
    'social',
    'sound',
    'text',
  ]),
  utm_content: new Set([
    'announcement',
    'bio',
    'community',
    'curator',
    'description',
    'outreach',
    'post',
    'press',
    'promo',
    'server',
    'story',
    'use_sound',
  ]),
};
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_TOKEN_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

export type ServerAnalyticsDelivery =
  | {
      readonly ok: true;
      /**
       * Persisted row id. `null` when a caller-supplied idempotency key
       * matched an existing row — the event was already durably recorded.
       */
      readonly eventId: string | null;
    }
  | {
      readonly ok: false;
      readonly error:
        | 'unknown_event'
        | 'invalid_properties'
        | 'persistence_failed'
        | 'delivery_unknown';
    };

function isKnownEvent(event: string): event is ServerAnalyticsEventName {
  return Object.hasOwn(SERVER_ANALYTICS_EVENTS, event);
}

function sanitizeProperties(
  definition: ServerAnalyticsEventDefinition,
  properties: Record<string, unknown> | undefined
): Record<string, SafePropertyValue> {
  const sanitized: Record<string, SafePropertyValue> = {};

  for (const key of definition.properties) {
    const value = properties?.[key];
    if (value === null || typeof value === 'boolean') {
      sanitized[key] = value;
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      sanitized[key] = value;
    } else if (
      typeof value === 'string' &&
      UUID_PROPERTY_NAMES.has(key) &&
      UUID_PATTERN.test(value)
    ) {
      sanitized[key] = value;
    } else if (
      typeof value === 'string' &&
      ENUM_PROPERTY_VALUES[key]?.has(value)
    ) {
      sanitized[key] = value;
    } else if (
      typeof value === 'string' &&
      SAFE_TOKEN_PROPERTY_NAMES.has(key) &&
      SAFE_TOKEN_PATTERN.test(value)
    ) {
      sanitized[key] = value;
    } else if (typeof value === 'string' && UTM_PROPERTY_VALUES[key]) {
      const normalized = value.trim().toLowerCase();
      if (normalized) {
        sanitized[key] = UTM_PROPERTY_VALUES[key].has(normalized)
          ? normalized
          : 'other';
      }
    } else if (
      key === 'country_code' &&
      typeof value === 'string' &&
      /^[A-Za-z]{2}$/.test(value)
    ) {
      sanitized[key] = value.toUpperCase();
    }
  }

  return sanitized;
}

export interface ServerAnalyticsTrackOptions {
  /**
   * Stable, server-derived dedupe key (e.g. `stripe_event:evt_...` or
   * `onboarding_completed:<profile uuid>`). When supplied, the insert uses
   * the unique `idempotency_key` index so retries collapse to one row and a
   * duplicate call resolves `ok: true` with `eventId: null`.
   */
  readonly idempotencyKey?: string;
}

export async function trackServerEvent(
  event: string,
  properties?: Record<string, unknown>,
  _distinctId?: string,
  options?: ServerAnalyticsTrackOptions
): Promise<ServerAnalyticsDelivery> {
  // JOV-5245 owns identity. This sink deliberately keeps its no-op identity
  // contract and never persists the raw distinct id.

  if (!isKnownEvent(event)) {
    Sentry.captureException(new Error('Unknown server analytics event'), {
      tags: {
        context: 'server_analytics_contract',
        contract_version: SERVER_ANALYTICS_CONTRACT_VERSION,
        event_name: event,
      },
    });
    return { ok: false, error: 'unknown_event' };
  }

  const definition: ServerAnalyticsEventDefinition =
    SERVER_ANALYTICS_EVENTS[event];
  const sanitized = sanitizeProperties(definition, properties);
  const sourceEntityId = definition.source
    ? sanitized[definition.source.property]
    : undefined;

  if (definition.source && typeof sourceEntityId !== 'string') {
    Sentry.captureException(new Error('Invalid server analytics source'), {
      tags: {
        context: 'server_analytics_contract',
        contract_version: SERVER_ANALYTICS_CONTRACT_VERSION,
        event_name: event,
        source_type: definition.source.type,
      },
    });
    return { ok: false, error: 'invalid_properties' };
  }

  const idempotencyKey =
    options?.idempotencyKey && SAFE_TOKEN_PATTERN.test(options.idempotencyKey)
      ? options.idempotencyKey
      : null;

  if (options?.idempotencyKey && !idempotencyKey) {
    Sentry.captureException(
      new Error('Invalid server analytics idempotency key'),
      {
        tags: {
          context: 'server_analytics_contract',
          contract_version: SERVER_ANALYTICS_CONTRACT_VERSION,
          event_name: event,
        },
      }
    );
    return { ok: false, error: 'invalid_properties' };
  }

  try {
    const insert = db.insert(serverAnalyticsEvents).values({
      contractVersion: SERVER_ANALYTICS_CONTRACT_VERSION,
      eventName: event,
      category: definition.category,
      privacyClass: SERVER_ANALYTICS_PRIVACY_CLASS,
      consentPolicy: SERVER_ANALYTICS_CONSENT_POLICY,
      sourceEntityType: definition.source?.type ?? null,
      sourceEntityId:
        typeof sourceEntityId === 'string' ? sourceEntityId : null,
      properties: sanitized,
      idempotencyKey,
      occurredAt: new Date(),
    });

    const [stored] = await withTimeout(
      (idempotencyKey
        ? insert.onConflictDoNothing({
            target: serverAnalyticsEvents.idempotencyKey,
          })
        : insert
      ).returning({ id: serverAnalyticsEvents.id }),
      {
        timeoutMs: SERVER_ANALYTICS_DELIVERY_TIMEOUT_MS,
        context: 'Server analytics delivery',
      }
    );

    // An idempotency-keyed conflict is a durable duplicate, not a failure:
    // the transition was already measured by the earlier write.
    if (!stored && idempotencyKey) {
      return { ok: true, eventId: null };
    }
    if (!stored) throw new Error('Server analytics insert returned no row');
    return { ok: true, eventId: stored.id };
  } catch (error) {
    const deliveryUnknown =
      error instanceof Error &&
      error.message ===
        `Server analytics delivery timed out after ${SERVER_ANALYTICS_DELIVERY_TIMEOUT_MS}ms`;
    Sentry.captureException(error, {
      tags: {
        context: 'server_analytics_delivery',
        contract_version: SERVER_ANALYTICS_CONTRACT_VERSION,
        delivery_outcome: deliveryUnknown ? 'unknown' : 'failed',
        event_name: event,
      },
    });
    return {
      ok: false,
      error: deliveryUnknown ? 'delivery_unknown' : 'persistence_failed',
    };
  }
}

export async function identifyServerUser(
  distinctId: string,
  properties?: Record<string, unknown>
) {
  await identifyUser(distinctId, properties);
}

export async function flushServerAnalytics() {
  // No-op: runtime-aware analytics do not buffer events.
}

export async function shutdownServerAnalytics() {
  // No-op: runtime-aware analytics do not maintain a long-lived client.
}
