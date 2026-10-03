import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import * as Sentry from '@sentry/nextjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LIMITED_DROP_EVENT_NAMES } from '@/lib/analytics/limited-drop-funnel';

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  onConflictDoNothing: vi.fn(),
  returning: vi.fn(),
  values: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: { insert: mocks.insert },
}));

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}));

import {
  SERVER_ANALYTICS_CALLSITE_INVENTORY,
  SERVER_ANALYTICS_CONSENT_POLICY,
  SERVER_ANALYTICS_CONTRACT_VERSION,
  SERVER_ANALYTICS_DELIVERY_TIMEOUT_MS,
  SERVER_ANALYTICS_EVENTS,
  trackServerEvent,
  trackServerEventTx,
} from './server-analytics';

const WEB_ROOT = process.cwd();
const PROFILE_ID = '11111111-1111-4111-8111-111111111111';
const RELEASE_ID = '22222222-2222-4222-8222-222222222222';
const TOUR_DATE_ID = '33333333-3333-4333-8333-333333333333';

function countProductionCallSites(directory: string): number {
  let count = 0;

  for (const entry of readdirSync(directory)) {
    if (['.next', 'coverage', 'node_modules'].includes(entry)) continue;
    const path = join(directory, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      count += countProductionCallSites(path);
      continue;
    }
    if (!/\.(?:ts|tsx)$/.test(entry) || /\.test\.|\.spec\./.test(entry)) {
      continue;
    }
    if (path.endsWith(join('lib', 'server-analytics.ts'))) continue;

    count +=
      readFileSync(path, 'utf8').match(/\btrackServerEvent\s*\(/g)?.length ?? 0;
  }

  return count;
}

describe('server analytics contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.returning.mockResolvedValue([{ id: 'event-1' }]);
    mocks.onConflictDoNothing.mockReturnValue({ returning: mocks.returning });
    mocks.values.mockReturnValue({
      onConflictDoNothing: mocks.onConflictDoNothing,
      returning: mocks.returning,
    });
    mocks.insert.mockReturnValue({ values: mocks.values });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('versions and inventories every production call site', {
    timeout: 60000,
  }, () => {
    expect(SERVER_ANALYTICS_CONTRACT_VERSION).toBe('server-analytics/v1');
    expect(SERVER_ANALYTICS_DELIVERY_TIMEOUT_MS).toBe(2_000);
    expect(SERVER_ANALYTICS_CONSENT_POLICY).toBe(
      'first_party_operational_measurement'
    );
    expect(countProductionCallSites(WEB_ROOT)).toBe(38);
    expect(
      SERVER_ANALYTICS_CALLSITE_INVENTORY.reduce(
        (total, entry) => total + entry.invocations,
        0
      )
    ).toBe(38);

    for (const entry of SERVER_ANALYTICS_CALLSITE_INVENTORY) {
      const source = readFileSync(join(WEB_ROOT, entry.path), 'utf8');
      expect(source.match(/\btrackServerEvent\s*\(/g)?.length ?? 0).toBe(
        entry.invocations
      );
      if (entry.path === 'lib/analytics/limited-drop-funnel.server.ts') {
        expect(entry.events).toEqual(LIMITED_DROP_EVENT_NAMES);
        expect(source).toContain('limitedDropEventSchema.safeParse');
        expect(source).toContain('trackServerEvent(eventName');
        continue;
      }
      for (const event of entry.events) {
        expect(source).toContain(`'${event}'`);
      }
      if (entry.path.includes('/auth/')) {
        expect(source).not.toMatch(/\bvoid\s+trackAuthEvent\s*\(/);
      }
    }

    const inventoriedEvents = new Set(
      SERVER_ANALYTICS_CALLSITE_INVENTORY.flatMap(entry => entry.events)
    );
    expect(inventoriedEvents).toEqual(
      new Set(Object.keys(SERVER_ANALYTICS_EVENTS))
    );
  });

  it('persists an allowlisted event with a reconcilable source record', async () => {
    const result = await trackServerEvent(
      'release_deleted',
      {
        profileId: PROFILE_ID,
        releaseId: RELEASE_ID,
        releaseTitle: 'not needed for reconciliation',
        email: 'must-not-persist@example.com',
        utm_campaign: 'Fall release / creator launch + paid',
      },
      'raw-user-id-must-not-persist'
    );

    expect(result).toEqual({
      ok: true,
      eventId: 'event-1',
      deduplicated: false,
    });
    expect(mocks.values).toHaveBeenCalledWith(
      expect.objectContaining({
        contractVersion: 'server-analytics/v1',
        consentPolicy: 'first_party_operational_measurement',
        eventName: 'release_deleted',
        privacyClass: 'pseudonymous_ids_no_contact_data',
        properties: {
          profileId: PROFILE_ID,
          releaseId: RELEASE_ID,
        },
        sourceEntityId: PROFILE_ID,
        sourceEntityType: 'creator_profile',
      })
    );
    expect(JSON.stringify(mocks.values.mock.calls[0])).not.toContain(
      'raw-user-id-must-not-persist'
    );
    expect(JSON.stringify(mocks.values.mock.calls[0])).not.toContain(
      'must-not-persist@example.com'
    );
  });

  it('keeps non-idempotent events independent of the identity index', async () => {
    await trackServerEvent('funnel_step', {
      funnel_id: 'artist_signup',
      step: 'cta_click',
      outcome: 'reached',
      surface: 'homepage',
    });

    expect(mocks.values.mock.calls[0][0]).not.toHaveProperty('eventIdentity');
    expect(mocks.onConflictDoNothing).not.toHaveBeenCalled();
    expect(mocks.returning).toHaveBeenCalledWith({ id: expect.anything() });
  });

  it('keeps attribution groupings without storing public query text', async () => {
    await trackServerEvent('smart_link_clicked', {
      profileId: 'attacker@example.com',
      releaseId: RELEASE_ID,
      provider: 'spotify',
      utm_source: 'instagram',
      utm_medium: 'social',
      utm_campaign: 'Fall release / creator launch + paid',
      utm_content: 'attacker@example.com',
      utm_term: '+1 (415) 555-1212',
      utm_campaign_matches_release: true,
    });

    expect(mocks.values).toHaveBeenCalledWith(
      expect.objectContaining({
        properties: expect.objectContaining({
          provider: 'spotify',
          releaseId: RELEASE_ID,
          utm_source: 'instagram',
          utm_medium: 'social',
          utm_content: 'other',
          utm_campaign_matches_release: true,
        }),
        sourceEntityId: RELEASE_ID,
        sourceEntityType: 'release',
      })
    );
    expect(JSON.stringify(mocks.values.mock.calls[0])).not.toContain(
      'attacker@example.com'
    );
    expect(JSON.stringify(mocks.values.mock.calls[0])).not.toContain('415');
  });

  it('normalizes country codes and never source-links notification payloads', async () => {
    await trackServerEvent('notifications_subscribe_success', {
      artist_id: PROFILE_ID,
      channel: 'email',
      country_code: 'us',
      source: 'attacker@example.com',
    });

    expect(mocks.values).toHaveBeenCalledWith(
      expect.objectContaining({
        properties: {
          artist_id: PROFILE_ID,
          channel: 'email',
          country_code: 'US',
        },
        sourceEntityId: null,
        sourceEntityType: null,
      })
    );
    expect(JSON.stringify(mocks.values.mock.calls[0])).not.toContain(
      'attacker@example.com'
    );
  });

  it('rejects a source-backed event whose source id is invalid', async () => {
    const result = await trackServerEvent('tour_date_deleted', {
      profileId: 'not-a-uuid',
      tourDateId: TOUR_DATE_ID,
    });

    expect(result).toEqual({ ok: false, error: 'invalid_properties' });
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Invalid server analytics source' }),
      expect.objectContaining({
        tags: expect.objectContaining({
          event_name: 'tour_date_deleted',
          source_type: 'creator_profile',
        }),
      })
    );
  });

  it('rejects events outside the versioned contract without writing', async () => {
    const result = await trackServerEvent('invented_event', {
      profileId: 'p1',
    });

    expect(result).toEqual({ ok: false, error: 'unknown_event' });
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(Sentry.captureException).toHaveBeenCalledOnce();
  });

  it('makes persistence failures observable and returns an explicit error', async () => {
    const databaseError = new Error('database unavailable');
    mocks.returning.mockRejectedValueOnce(databaseError);

    const result = await trackServerEvent('tour_date_deleted', {
      profileId: PROFILE_ID,
      tourDateId: TOUR_DATE_ID,
    });

    expect(result).toEqual({ ok: false, error: 'persistence_failed' });
    expect(Sentry.captureException).toHaveBeenCalledWith(databaseError, {
      tags: {
        context: 'server_analytics_delivery',
        contract_version: 'server-analytics/v1',
        delivery_outcome: 'failed',
        event_name: 'tour_date_deleted',
      },
    });
  });

  it('bounds delivery latency and reports a timed-out insert', async () => {
    vi.useFakeTimers();
    mocks.returning.mockReturnValueOnce(new Promise(() => {}));

    const delivery = trackServerEvent('release_deleted', {
      profileId: PROFILE_ID,
      releaseId: RELEASE_ID,
    });
    await vi.advanceTimersByTimeAsync(SERVER_ANALYTICS_DELIVERY_TIMEOUT_MS);

    await expect(delivery).resolves.toEqual({
      ok: false,
      error: 'delivery_unknown',
    });
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Server analytics delivery timed out after 2000ms',
      }),
      expect.objectContaining({
        tags: expect.objectContaining({
          context: 'server_analytics_delivery',
          delivery_outcome: 'unknown',
          event_name: 'release_deleted',
        }),
      })
    );
  });

  it('deduplicates emissions that share a stable event identity', async () => {
    mocks.returning.mockResolvedValueOnce([]);

    const result = await trackServerEvent(
      'payment_succeeded',
      {
        stripeEventId: 'evt_1',
        billingReason: 'subscription_create',
      },
      undefined,
      { eventIdentity: 'stripe:evt_1' }
    );

    expect(result).toEqual({ ok: true, eventId: null, deduplicated: true });
    expect(mocks.onConflictDoNothing).toHaveBeenCalledWith({
      target: expect.anything(),
    });
    expect(mocks.values).toHaveBeenCalledWith(
      expect.objectContaining({
        eventIdentity: 'stripe:evt_1',
        eventName: 'payment_succeeded',
        category: 'billing',
        properties: {
          stripeEventId: 'evt_1',
          billingReason: 'subscription_create',
        },
      })
    );
  });

  it('persists an authoritative business timestamp for delayed events', async () => {
    const occurredAt = new Date('2026-09-27T10:00:00.000Z');

    await trackServerEvent(
      'subscription_churned',
      { stripeEventId: 'evt_delayed' },
      undefined,
      { eventIdentity: 'stripe:evt_delayed', occurredAt }
    );

    expect(mocks.values).toHaveBeenCalledWith(
      expect.objectContaining({ occurredAt })
    );
  });

  it('rejects an invalid authoritative timestamp without writing', async () => {
    const result = await trackServerEvent(
      'subscription_churned',
      { stripeEventId: 'evt_invalid_time' },
      undefined,
      {
        eventIdentity: 'stripe:evt_invalid_time',
        occurredAt: new Date(Number.NaN),
      }
    );

    expect(result).toEqual({ ok: false, error: 'invalid_properties' });
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Invalid server analytics timestamp',
      }),
      expect.objectContaining({
        tags: expect.objectContaining({ event_name: 'subscription_churned' }),
      })
    );
  });

  it('restores the caller timeout after a transaction-scoped insert', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ statementTimeout: '45s' }] })
      .mockResolvedValue(undefined);

    const result = await trackServerEventTx(
      {
        execute,
        insert: mocks.insert,
      } as never,
      'signup_completed',
      { profileId: PROFILE_ID, source: 'organic' },
      { eventIdentity: `signup_completed:${PROFILE_ID}` }
    );

    expect(result).toEqual({
      ok: true,
      eventId: 'event-1',
      deduplicated: false,
    });
    expect(execute).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(execute.mock.calls[0])).toContain(
      "current_setting('statement_timeout')"
    );
    expect(JSON.stringify(execute.mock.calls[1])).toContain(
      String(SERVER_ANALYTICS_DELIVERY_TIMEOUT_MS)
    );
    expect(JSON.stringify(execute.mock.calls[2])).toContain('45s');
    expect(execute.mock.invocationCallOrder[1]).toBeLessThan(
      mocks.insert.mock.invocationCallOrder[0]
    );
    expect(mocks.insert.mock.invocationCallOrder[0]).toBeLessThan(
      execute.mock.invocationCallOrder[2]
    );
  });

  it('rejects an unsafe event identity without writing', async () => {
    const result = await trackServerEvent(
      'checkout_initiated',
      { checkoutSessionId: 'cs_1', plan: 'pro', source: 'billing' },
      undefined,
      { eventIdentity: 'not a safe identity!!' }
    );

    expect(result).toEqual({ ok: false, error: 'invalid_properties' });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('defines durable revenue funnel events in the versioned contract', () => {
    expect(SERVER_ANALYTICS_EVENTS.claim_started.category).toBe('funnel');
    expect(SERVER_ANALYTICS_EVENTS.claim_completed.category).toBe('funnel');
    expect(SERVER_ANALYTICS_EVENTS.signup_completed.category).toBe('funnel');
    expect(SERVER_ANALYTICS_EVENTS.activation_achieved.category).toBe('funnel');
    expect(SERVER_ANALYTICS_EVENTS.checkout_initiated.category).toBe('funnel');
    expect(SERVER_ANALYTICS_EVENTS.payment_succeeded.category).toBe('billing');
    expect(SERVER_ANALYTICS_EVENTS.subscription_renewed.category).toBe(
      'billing'
    );
    expect(SERVER_ANALYTICS_EVENTS.subscription_churned.category).toBe(
      'billing'
    );
  });
});
