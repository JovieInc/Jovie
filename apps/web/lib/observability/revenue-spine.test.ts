import { createRequire } from 'node:module';
import { withScope } from '@sentry/nextjs';
import type { ErrorEvent } from '@sentry/node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildRevenueSpineFailure,
  captureRevenueSpineFailure,
  REVENUE_SPINE_FAILURE_CODES,
  REVENUE_SPINE_STAGES,
  type RevenueSpineStage,
} from './revenue-spine';

// Exercise the real SDK's scope merge and processors, including inherited PII.
vi.mock('@sentry/nextjs', async () => {
  const { createRequire } = await import('node:module');
  const sdk = createRequire(import.meta.url)(
    '@sentry/node'
  ) as typeof import('@sentry/node');
  return { captureEvent: sdk.captureEvent, withScope: vi.fn(sdk.withScope) };
});
const Sentry = createRequire(import.meta.url)(
  '@sentry/node'
) as typeof import('@sentry/node');

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';

describe('revenue spine contract', () => {
  it('keeps the registries sorted and fingerprints independent of impact and identity', () => {
    expect([...REVENUE_SPINE_STAGES].sort()).toEqual(REVENUE_SPINE_STAGES);
    expect([...REVENUE_SPINE_FAILURE_CODES].sort()).toEqual(
      REVENUE_SPINE_FAILURE_CODES
    );
    const first = buildRevenueSpineFailure({
      stage: 'rls_setup',
      severity: 'blocked',
      userId: USER_A,
      error: Object.assign(new Error('query with private values'), {
        code: '42501',
      }),
    });
    const repeat = buildRevenueSpineFailure({
      stage: 'rls_setup',
      severity: 'degraded',
      userId: USER_B,
      error: new Error('different wrapper', { cause: { code: '42501' } }),
    });
    expect(first.fingerprint).toBe(
      'revenue-spine:v1:rls_setup:permission_denied'
    );
    expect(repeat.fingerprint).toBe(first.fingerprint);
    expect(first.affected_user_id).not.toBe(repeat.affected_user_id);
    expect(
      buildRevenueSpineFailure({
        stage: 'checkout',
        severity: 'blocked',
        error: { code: '42501' },
      }).fingerprint
    ).not.toBe(first.fingerprint);
    expect(
      buildRevenueSpineFailure({
        stage: 'rls_setup',
        severity: 'blocked',
        error: { code: '42P01' },
      }).fingerprint
    ).not.toBe(first.fingerprint);
  });

  it.each([
    [{ code: '23505' }, 'unique_conflict'],
    [{ errorCode: 'SPOTIFY_IDENTITY_CONFLICT' }, 'ownership_conflict'],
    [new Error('[CLAIM_EXPIRED] private token'), 'claim_expired'],
    [{ type: 'StripeConnectionError' }, 'dependency_unavailable'],
    [{ name: 'AbortError' }, 'timeout'],
    [{ code: 'constructor' }, 'unexpected_error'],
    ['raw provider error', 'unexpected_error'],
  ] as const)('classifies only known root causes (%j)', (error, expected) => {
    expect(
      buildRevenueSpineFailure({
        stage: 'profile_claim',
        severity: 'blocked',
        error,
      }).failure_code
    ).toBe(expected);
  });

  it('bounds cyclic causes and drops unknown, email, and provider identities', () => {
    const cyclic: { cause?: unknown } = {};
    cyclic.cause = cyclic;
    for (const userId of [
      null,
      undefined,
      'email@example.com',
      'cus_private',
      'ba_private',
      'user_legacy',
    ]) {
      const event = buildRevenueSpineFailure({
        stage: 'auth_resolution',
        severity: 'unknown',
        userId,
        error: cyclic,
      });
      expect(event.affected_user_id).toBeNull();
      expect(event.failure_code).toBe('unexpected_error');
    }
  });

  it('rejects runtime values outside the closed contract', () => {
    expect(() =>
      buildRevenueSpineFailure({
        stage: 'raw-email@example.com' as RevenueSpineStage,
        severity: 'blocked',
      })
    ).toThrow('Invalid revenue spine failure contract');
  });
});

describe('revenue spine delivery', () => {
  let events: ErrorEvent[];

  beforeEach(() => {
    events = [];
    Sentry.init({
      dsn: 'https://public@example.invalid/1',
      defaultIntegrations: false,
      integrations: [Sentry.dedupeIntegration()],
      beforeSend(event) {
        events.push(event);
        // No network delivery in tests; inspect the actual final SDK event.
        return null;
      },
    });
  });

  afterEach(async () => {
    await Sentry.close(500);
    Sentry.getCurrentScope().setClient(undefined);
    Sentry.getIsolationScope().setUser(null);
  });

  it('preserves every occurrence while counting affected users separately', async () => {
    for (const userId of [USER_A, USER_A, USER_B, undefined]) {
      captureRevenueSpineFailure({
        stage: 'checkout',
        severity: 'blocked',
        failureCode: 'dependency_unavailable',
        userId,
      });
    }
    await Sentry.flush(500);
    expect(events).toHaveLength(4);
    expect(
      new Set(events.map(event => event.fingerprint?.join(':'))).size
    ).toBe(1);
    const affectedUsers = new Set(
      events.flatMap(event => (event.user?.id ? [event.user.id] : []))
    );
    expect(affectedUsers.size).toBe(2);
    expect(
      events.map(event => event.contexts?.revenue_spine?.event_count)
    ).toEqual([1, 1, 1, 1]);
    expect(events[3]?.contexts?.revenue_spine?.affected_user_id).toBeNull();
  });

  it('strips inherited secrets and raw exceptions after SDK enrichment', async () => {
    Sentry.setUser({
      id: 'cus_private',
      email: 'private@example.com',
      ip_address: '192.0.2.1',
    });
    Sentry.setExtra('cookie', 'private-cookie');
    Sentry.setTag('provider', 'sub_private');
    Sentry.setContext('payment', { card: 'private-card-data' });
    Sentry.addBreadcrumb({ message: 'private-otp-and-token' });
    Sentry.addEventProcessor(event => ({
      ...event,
      request: {
        headers: { authorization: 'private-bearer' },
        cookies: { session: 'private-session' },
        data: 'private-body',
      },
      exception: { values: [{ value: 'private-exception' }] },
    }));
    for (const stage of REVENUE_SPINE_STAGES) {
      captureRevenueSpineFailure({
        stage,
        severity: 'degraded',
        userId: USER_A,
        error: Object.assign(new Error('private-raw-error'), {
          email: 'private@example.com',
          code: 'ETIMEDOUT',
        }),
      });
    }
    await Sentry.flush(500);
    expect(events).toHaveLength(9);
    for (const event of events) {
      expect(event.tags?.failure_code).toBe('timeout');
      expect(event.tags?.impact_severity).toBe('degraded');
      expect(event.user?.id).toMatch(/^[a-f0-9]{64}$/);
      expect(event.request).toBeUndefined();
      expect(event.breadcrumbs).toBeUndefined();
      expect(event.exception).toBeUndefined();
    }
    expect(JSON.stringify(events)).not.toMatch(
      /private|192\.0\.2\.1|11111111-1111|cus_|sub_/
    );
    expect(Sentry.getIsolationScope().getUser()?.email).toBe(
      'private@example.com'
    );
  });

  it('does not let a broken observability sink alter the caller outcome', () => {
    vi.mocked(withScope).mockImplementationOnce(() => {
      throw new Error('sink failed');
    });
    expect(() =>
      captureRevenueSpineFailure({ stage: 'webhook', severity: 'unknown' })
    ).not.toThrow();
  });
});
