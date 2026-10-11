import 'server-only';

import * as Sentry from '@sentry/nextjs';
import { sql as drizzleSql } from 'drizzle-orm';
import {
  LIMITED_DROP_CARD_PLACEMENTS,
  LIMITED_DROP_EVENT_NAMES,
  LIMITED_DROP_FUNNEL_CONTRACT_VERSION,
  LIMITED_DROP_ITEM_MODES,
  LIMITED_DROP_PAGE_IDS,
  LIMITED_DROP_STATES,
  LIMITED_DROP_TERMINAL_REASONS,
} from '@/lib/analytics/limited-drop-funnel';
import { identifyUser } from '@/lib/analytics/runtime-aware';
import {
  SIGNUP_FUNNEL_ALL_STEPS,
  SIGNUP_FUNNEL_IDS,
  SIGNUP_FUNNEL_OUTCOMES,
  SIGNUP_FUNNEL_SURFACES,
} from '@/lib/analytics/signup-funnel';
import { type DbOrTransaction, db } from '@/lib/db';
import { serverAnalyticsEvents } from '@/lib/db/schema/analytics';
import { withTimeout } from '@/lib/resilience/primitives';
import { ACCOUNT_METRIC_COHORTS } from '@/lib/utils/email';

export const SERVER_ANALYTICS_CONTRACT_VERSION = 'server-analytics/v2';
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
    | 'funnel'
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

const limitedDropProperties = [
  'contract_version',
  'event_id',
  'session_id',
  'artist_id',
  'asset_id',
  'drop_id',
  'page_id',
  'state',
  'card_placement',
  'share_id',
  'campaign_id',
  'experiment_id',
  'variant_id',
  'item_mode',
  'channel',
  'terminal_reason',
] as const;

const limitedDropEvent = {
  category: 'funnel',
  properties: limitedDropProperties,
  source: { property: 'artist_id', type: 'creator_profile' },
} as const satisfies ServerAnalyticsEventDefinition;

export const SERVER_ANALYTICS_EVENTS = {
  auth_started: authEvent,
  auth_provider_opened: authEvent,
  auth_callback_received: authEvent,
  auth_exchange_succeeded: authEvent,
  auth_exchange_failed: authEvent,
  auth_returned_to_client: authEvent,
  auth_wrong_surface_prevented: authEvent,
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
  claim_started: {
    category: 'funnel',
    properties: ['profileId', 'source'],
    source: { property: 'profileId', type: 'creator_profile' },
  },
  claim_completed: {
    category: 'funnel',
    properties: ['profileId', 'source'],
    source: { property: 'profileId', type: 'creator_profile' },
  },
  signup_completed: {
    category: 'funnel',
    properties: ['profileId', 'source'],
    source: { property: 'profileId', type: 'creator_profile' },
  },
  activation_achieved: {
    category: 'funnel',
    properties: ['profileId', 'source'],
    source: { property: 'profileId', type: 'creator_profile' },
  },
  checkout_initiated: {
    category: 'funnel',
    properties: ['checkoutSessionId', 'plan', 'source'],
  },
  payment_succeeded: {
    category: 'billing',
    properties: ['stripeEventId', 'billingReason', 'checkoutSessionId'],
  },
  subscription_renewed: {
    category: 'billing',
    properties: ['stripeEventId', 'billingReason'],
  },
  subscription_churned: {
    category: 'billing',
    properties: ['stripeEventId'],
  },
  // signup-funnel/v2: no source entity, so a step can never be joined back
  // to a profile, user, or visitor.
  funnel_step: {
    category: 'funnel',
    properties: ['funnel_id', 'step', 'outcome', 'surface', 'reason', 'cohort'],
  },
  asset_page_viewed: limitedDropEvent,
  drop_countdown_viewed: limitedDropEvent,
  drop_capture_started: limitedDropEvent,
  drop_capture_submitted: limitedDropEvent,
  drop_marketing_consent_granted: limitedDropEvent,
  drop_purchase_started: limitedDropEvent,
  drop_purchase_completed: limitedDropEvent,
  drop_terminal_reached: limitedDropEvent,
  profile_card_impression: limitedDropEvent,
  profile_card_clicked: limitedDropEvent,
  completed_drop_card_exposure: limitedDropEvent,
  completed_drop_signup: limitedDropEvent,
  /**
   * Artist Presence ($199/mo) upgrade offer presented once per claimed
   * artist after first profile claim (JOV-6675). Keyed by creator profile so
   * the offer state survives sessions and the funnel resolves
   * seen → accepted → checkout → paid.
   */
  onboarding_upgrade_offer_seen: {
    category: 'billing',
    properties: ['profileId', 'plan'],
    source: { property: 'profileId', type: 'creator_profile' },
  },
  onboarding_upgrade_offer_accepted: {
    category: 'billing',
    properties: ['profileId', 'plan'],
    source: { property: 'profileId', type: 'creator_profile' },
  },
  onboarding_upgrade_offer_dismissed: {
    category: 'billing',
    properties: ['profileId', 'plan'],
    source: { property: 'profileId', type: 'creator_profile' },
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
    events: ['releases_synced', 'claim_completed', 'activation_achieved'],
  },
  {
    path: 'app/onboarding/actions/index.ts',
    invocations: 0,
    events: ['claim_completed', 'signup_completed', 'activation_achieved'],
  },
  {
    path: 'lib/onboarding/upgrade-offer.ts',
    invocations: 1,
    events: [
      'onboarding_upgrade_offer_seen',
      'onboarding_upgrade_offer_accepted',
      'onboarding_upgrade_offer_dismissed',
    ],
  },
  {
    path: 'app/r/[slug]/page.tsx',
    invocations: 1,
    events: ['smart_link_clicked'],
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
  {
    path: 'app/api/stripe/checkout/route.ts',
    invocations: 1,
    events: ['checkout_initiated'],
  },
  {
    path: 'lib/stripe/webhooks/handlers/payment-handler.ts',
    invocations: 1,
    events: ['payment_succeeded', 'subscription_renewed'],
  },
  {
    path: 'lib/stripe/webhooks/handlers/subscription-handler.ts',
    invocations: 1,
    events: ['subscription_churned'],
  },
  {
    path: 'lib/claim/context.ts',
    invocations: 1,
    events: ['claim_started'],
  },
  {
    path: 'lib/analytics/signup-funnel.server.ts',
    invocations: 1,
    events: ['funnel_step'],
  },
  {
    path: 'lib/analytics/limited-drop-funnel.server.ts',
    invocations: 1,
    events: LIMITED_DROP_EVENT_NAMES,
  },
] as const satisfies ReadonlyArray<{
  readonly path: string;
  readonly invocations: number;
  readonly events: readonly ServerAnalyticsEventName[];
}>;

type SafePropertyValue = string | number | boolean | null;

const UUID_PROPERTY_NAMES = new Set([
  'artist_id',
  'asset_id',
  'drop_id',
  'eventId',
  'event_id',
  'profileId',
  'releaseId',
  'session_id',
  'tourDateId',
]);
const SAFE_TOKEN_PROPERTY_NAMES = new Set([
  'billingReason',
  'campaign_id',
  'checkoutSessionId',
  'code',
  'error_type',
  'experiment_id',
  'gate',
  'plan',
  'planRequired',
  'provider',
  'reason',
  'result',
  'share_id',
  'source',
  'stripeEventId',
  'toolName',
  'variant_id',
]);
const ENUM_PROPERTY_VALUES: Readonly<Record<string, ReadonlySet<string>>> = {
  card_placement: new Set(LIMITED_DROP_CARD_PLACEMENTS),
  channel: new Set(['email', 'sms']),
  client: new Set(['web', 'ios', 'electron']),
  contract_version: new Set([LIMITED_DROP_FUNNEL_CONTRACT_VERSION]),
  intent: new Set(['sign_in', 'sign_up']),
  method: new Set(['email_link', 'dashboard', 'api', 'dropdown']),
  funnel_id: new Set(SIGNUP_FUNNEL_IDS),
  step: new Set(SIGNUP_FUNNEL_ALL_STEPS),
  outcome: new Set(SIGNUP_FUNNEL_OUTCOMES),
  cohort: new Set(ACCOUNT_METRIC_COHORTS),
  item_mode: new Set(LIMITED_DROP_ITEM_MODES),
  page_id: new Set(LIMITED_DROP_PAGE_IDS),
  state: new Set(LIMITED_DROP_STATES),
  surface: new Set(SIGNUP_FUNNEL_SURFACES),
  terminal_reason: new Set(LIMITED_DROP_TERMINAL_REASONS),
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
      readonly eventId: string | null;
      readonly deduplicated: boolean;
    }
  | {
      readonly ok: false;
      readonly error:
        | 'unknown_event'
        | 'invalid_properties'
        | 'persistence_failed'
        | 'delivery_unknown';
    };

export interface ServerAnalyticsEmitOptions {
  /**
   * Stable, server-derived identity for idempotent emission. When present, the
   * insert runs under the `event_identity` unique constraint so retries,
   * refreshes, and webhook redeliveries record the business event exactly
   * once. Must match the safe-token pattern (e.g. `stripe:evt_123`).
   */
  readonly eventIdentity?: string;
  /** Authoritative server-side business timestamp for delayed/retried events. */
  readonly occurredAt?: Date;
}

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

type PreparedInsert =
  | {
      readonly ok: true;
      readonly eventName: ServerAnalyticsEventName;
      readonly values: typeof serverAnalyticsEvents.$inferInsert;
    }
  | {
      readonly ok: false;
      readonly error: 'unknown_event' | 'invalid_properties';
    };

function prepareServerAnalyticsInsert(
  event: string,
  properties: Record<string, unknown> | undefined,
  options?: ServerAnalyticsEmitOptions
): PreparedInsert {
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

  if (
    options?.eventIdentity !== undefined &&
    !SAFE_TOKEN_PATTERN.test(options.eventIdentity)
  ) {
    Sentry.captureException(new Error('Invalid server analytics identity'), {
      tags: {
        context: 'server_analytics_contract',
        contract_version: SERVER_ANALYTICS_CONTRACT_VERSION,
        event_name: event,
      },
    });
    return { ok: false, error: 'invalid_properties' };
  }

  if (
    options?.occurredAt !== undefined &&
    !Number.isFinite(options.occurredAt.getTime())
  ) {
    Sentry.captureException(new Error('Invalid server analytics timestamp'), {
      tags: {
        context: 'server_analytics_contract',
        contract_version: SERVER_ANALYTICS_CONTRACT_VERSION,
        event_name: event,
      },
    });
    return { ok: false, error: 'invalid_properties' };
  }

  return {
    ok: true,
    eventName: event,
    values: {
      contractVersion: SERVER_ANALYTICS_CONTRACT_VERSION,
      eventName: event,
      category: definition.category,
      privacyClass: SERVER_ANALYTICS_PRIVACY_CLASS,
      consentPolicy: SERVER_ANALYTICS_CONSENT_POLICY,
      sourceEntityType: definition.source?.type ?? null,
      sourceEntityId:
        typeof sourceEntityId === 'string' ? sourceEntityId : null,
      ...(options?.eventIdentity === undefined
        ? {}
        : { eventIdentity: options.eventIdentity }),
      properties: sanitized,
      occurredAt: options?.occurredAt ?? new Date(),
    },
  };
}

async function insertServerAnalyticsRow(
  client: DbOrTransaction,
  prepared: Extract<PreparedInsert, { ok: true }>
): Promise<ServerAnalyticsDelivery> {
  const insert = client.insert(serverAnalyticsEvents).values(prepared.values);
  // Ordinary events do not need deduplication and must not depend on the
  // optional identity column's unique index being available.
  const query = prepared.values.eventIdentity
    ? insert.onConflictDoNothing({
        target: serverAnalyticsEvents.eventIdentity,
      })
    : insert;
  const [stored] = await query.returning({ id: serverAnalyticsEvents.id });

  if (!stored) {
    // The event_identity unique constraint deduplicated this emission; the
    // business event is already durably recorded.
    return { ok: true, eventId: null, deduplicated: true };
  }
  return { ok: true, eventId: stored.id, deduplicated: false };
}

export async function trackServerEvent(
  event: string,
  properties?: Record<string, unknown>,
  _distinctId?: string,
  options?: ServerAnalyticsEmitOptions
): Promise<ServerAnalyticsDelivery> {
  // JOV-5245 owns identity. This sink deliberately keeps its no-op identity
  // contract and never persists the raw distinct id.

  const prepared = prepareServerAnalyticsInsert(event, properties, options);
  if (!prepared.ok) return prepared;

  try {
    return await withTimeout(insertServerAnalyticsRow(db, prepared), {
      timeoutMs: SERVER_ANALYTICS_DELIVERY_TIMEOUT_MS,
      context: 'Server analytics delivery',
    });
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
        event_name: prepared.eventName,
      },
    });
    return {
      ok: false,
      error: deliveryUnknown ? 'delivery_unknown' : 'persistence_failed',
    };
  }
}

/**
 * Emit a server analytics event inside an existing transaction so the
 * business state write and its measurement commit atomically. Use this for
 * revenue-critical transitions (claim/signup/activation) where a post-commit
 * emission could permanently lose the event. A duplicate `eventIdentity`
 * deduplicates instead of throwing.
 */
export async function trackServerEventTx(
  tx: DbOrTransaction,
  event: string,
  properties?: Record<string, unknown>,
  options?: ServerAnalyticsEmitOptions
): Promise<ServerAnalyticsDelivery> {
  const prepared = prepareServerAnalyticsInsert(event, properties, options);
  if (!prepared.ok) return prepared;

  // Bound lock waits and execution in the database itself. A JavaScript race
  // cannot cancel an in-flight statement and could let the surrounding
  // transaction remain pinned after the caller has already timed out. Restore
  // the caller's timeout after a successful insert so later business queries
  // in the same transaction do not inherit this analytics-specific budget.
  const previousTimeoutResult = await tx.execute<{
    statementTimeout: string;
  }>(
    drizzleSql`SELECT current_setting('statement_timeout') AS "statementTimeout"`
  );
  const previousTimeout =
    previousTimeoutResult.rows[0]?.statementTimeout ?? '0';
  await tx.execute(
    drizzleSql`SELECT set_config('statement_timeout', ${String(SERVER_ANALYTICS_DELIVERY_TIMEOUT_MS)}, true)`
  );
  const delivery = await insertServerAnalyticsRow(tx, prepared);
  await tx.execute(
    drizzleSql`SELECT set_config('statement_timeout', ${previousTimeout}, true)`
  );
  return delivery;
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
