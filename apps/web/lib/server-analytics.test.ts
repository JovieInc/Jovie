import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import * as Sentry from '@sentry/nextjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
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
    mocks.values.mockReturnValue({ returning: mocks.returning });
    mocks.insert.mockReturnValue({ values: mocks.values });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('versions and inventories every production call site', () => {
    expect(SERVER_ANALYTICS_CONTRACT_VERSION).toBe('server-analytics/v1');
    expect(SERVER_ANALYTICS_DELIVERY_TIMEOUT_MS).toBe(2_000);
    expect(SERVER_ANALYTICS_CONSENT_POLICY).toBe(
      'first_party_operational_measurement'
    );
    expect(countProductionCallSites(WEB_ROOT)).toBe(29);
    expect(
      SERVER_ANALYTICS_CALLSITE_INVENTORY.reduce(
        (total, entry) => total + entry.invocations,
        0
      )
    ).toBe(29);

    for (const entry of SERVER_ANALYTICS_CALLSITE_INVENTORY) {
      const source = readFileSync(join(WEB_ROOT, entry.path), 'utf8');
      expect(source.match(/\btrackServerEvent\s*\(/g)?.length ?? 0).toBe(
        entry.invocations
      );
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

    expect(result).toEqual({ ok: true, eventId: 'event-1' });
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
});
