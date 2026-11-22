import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';
import {
  appendResetGrant,
  appendUsageEvent,
  beginRefresh,
  createEmptyLedger,
  endRefresh,
  evaluateRecovery,
  EVENT_SCHEMA,
  GRANT_SCHEMA,
  PLAN_SCHEMA,
  projectOvieUsagePools,
  readPoolState,
  refreshAllowed,
  scheduleBoundedReset,
  usageEventKey,
} from '../usage-ledger.mjs';
import {
  cursorPlanSnapshotFromAbout,
  cursorQuotaEventFromTranscript,
  CURSOR_PROVIDER,
  DEFAULT_CURSOR_POOL,
  ingestCursorPlanSnapshot,
  ingestCursorQuotaEvent as ingestQuota,
} from '../usage-ledger-cursor.mjs';

const FIXTURE_DIR = fileURLToPath(new URL('./fixtures/', import.meta.url));
const NOW = Date.parse('2026-11-18T20:20:00Z');
const planFixture = JSON.parse(
  readFileSync(`${FIXTURE_DIR}cursor-plan-snapshot.json`, 'utf8')
);
const quotaFixture = JSON.parse(
  readFileSync(`${FIXTURE_DIR}cursor-usage-quota-event.json`, 'utf8')
);

describe('usage ledger — cursor first slice', () => {
  test('fixture plan snapshot and quota event contain no secrets', () => {
    const blob = JSON.stringify({ planFixture, quotaFixture });
    assert.doesNotMatch(blob, /sk-[A-Za-z0-9]{10,}/);
    assert.doesNotMatch(blob, /@/);
  });

  test('immediate update on verified quota event', () => {
    let ledger = createEmptyLedger();
    ledger = ingestCursorPlanSnapshot(
      ledger,
      planFixture,
      { accountId: 'company-ultra', observedAt: planFixture.observedAt },
      { now: NOW }
    );
    const result = ingestQuota(ledger, quotaFixture.transcript, quotaFixture, { now: NOW });
    assert.equal(result.applied, true);
    const state = readPoolState(result.ledger, {
      provider: CURSOR_PROVIDER,
      accountId: 'company-ultra',
      pool: DEFAULT_CURSOR_POOL,
      now: NOW,
    });
    assert.equal(state.condition, 'exhausted');
    assert.equal(state.plan, 'ultra');
    assert.equal(state.freshness.status, 'fresh');
    assert.equal(state.remaining?.value, null);
    assert.equal(state.resetsAt, '2026-11-19T01:16:12Z');
  });

  test('cached read stays fresh inside maxAge; stale without forced read', () => {
    let ledger = createEmptyLedger();
    const applied = ingestQuota(ledger, quotaFixture.transcript, quotaFixture, { now: NOW });
    const fresh = readPoolState(applied.ledger, {
      provider: CURSOR_PROVIDER,
      accountId: 'company-ultra',
      pool: DEFAULT_CURSOR_POOL,
      now: NOW + 30 * 60_000,
      maxAgeMs: 3600_000,
    });
    assert.equal(fresh.freshness.status, 'fresh');
    const stale = readPoolState(applied.ledger, {
      provider: CURSOR_PROVIDER,
      accountId: 'company-ultra',
      pool: DEFAULT_CURSOR_POOL,
      now: NOW + 2 * 3600_000,
      maxAgeMs: 3600_000,
    });
    assert.equal(stale.freshness.status, 'stale');
    const forced = readPoolState(applied.ledger, {
      provider: CURSOR_PROVIDER,
      accountId: 'company-ultra',
      pool: DEFAULT_CURSOR_POOL,
      now: NOW + 2 * 3600_000,
      maxAgeMs: 3600_000,
      staleRead: true,
    });
    assert.equal(forced.freshness.status, 'fresh');
    assert.equal(forced.freshness.staleRead, true);
  });

  test('timer invalidation after newer reset observation', () => {
    let ledger = createEmptyLedger();
    ledger = scheduleBoundedReset(ledger, {
      provider: CURSOR_PROVIDER,
      accountId: 'company-ultra',
      pool: DEFAULT_CURSOR_POOL,
      dueAt: '2026-11-19T00:00:00Z',
      jobId: 'summer:cursor-reset-check',
      attemptId: 'a1',
      owner: 'summer',
      now: NOW,
    });
    const newer = ingestQuota(
      ledger,
      `${quotaFixture.transcript}\nResets at 2026-11-19T06:00:00Z`,
      {
        ...quotaFixture,
        observedAt: '2026-11-18T21:00:00Z',
        providerEventId: 'newer-reset-observation',
      },
      { now: NOW + 3_600_000 }
    );
    const scheduled = newer.ledger.scheduledResets.find(r => r.jobId === 'summer:cursor-reset-check');
    assert.equal(scheduled.status, 'superseded');
    assert.equal(scheduled.supersededBy, newer.event.idempotencyKey);
  });

  test('duplicate event suppression is idempotent', () => {
    let ledger = createEmptyLedger();
    const event = cursorQuotaEventFromTranscript(
      {
        accountId: 'company-ultra',
        transcript: quotaFixture.transcript,
        observedAt: quotaFixture.observedAt,
        providerEventId: quotaFixture.providerEventId,
      },
      { now: NOW }
    );
    const first = appendUsageEvent(ledger, event, { now: NOW });
    const second = appendUsageEvent(first.ledger, event, { now: NOW });
    assert.equal(first.applied, true);
    assert.equal(second.applied, false);
    assert.equal(second.duplicate, true);
    assert.equal(second.ledger.events.length, 1);
  });

  test('matching-account recovery succeeds after verified readback', () => {
    const recovery = evaluateRecovery({
      signal: 'bounded-check',
      provider: CURSOR_PROVIDER,
      accountId: 'company-ultra',
      pool: DEFAULT_CURSOR_POOL,
      authorizedAccountId: 'company-ultra',
      before: { remaining: { value: 0 }, condition: 'exhausted' },
      after: {
        provider: CURSOR_PROVIDER,
        pool: DEFAULT_CURSOR_POOL,
        remaining: { value: 42 },
        condition: 'available',
      },
    });
    assert.equal(recovery.recovered, true);
    assert.equal(recovery.reason, 'verified-readback');
  });

  test('no false recovery for pong, wrong account, auth failure, still exhausted', () => {
    const base = {
      provider: CURSOR_PROVIDER,
      accountId: 'company-ultra',
      pool: DEFAULT_CURSOR_POOL,
      authorizedAccountId: 'company-ultra',
      before: { remaining: { value: 0 }, condition: 'exhausted' },
      after: {
        provider: CURSOR_PROVIDER,
        pool: DEFAULT_CURSOR_POOL,
        remaining: { value: 10 },
        condition: 'available',
      },
    };
    assert.deepEqual(
      evaluateRecovery({ ...base, signal: 'pong' }),
      { recovered: false, reason: 'pong-not-capacity-proof' }
    );
    assert.deepEqual(
      evaluateRecovery({ ...base, authorizedAccountId: 'other-account' }),
      { recovered: false, reason: 'wrong-account' }
    );
    assert.deepEqual(
      evaluateRecovery({ ...base, after: { ...base.after, authFailure: true } }),
      { recovered: false, reason: 'auth-failure' }
    );
    assert.deepEqual(
      evaluateRecovery({
        ...base,
        after: { ...base.after, remaining: { value: 0 }, condition: 'exhausted' },
      }),
      { recovered: false, reason: 'still-exhausted' }
    );
  });

  test('coalesces concurrent refresh and backs off on provider errors', () => {
    let ledger = createEmptyLedger();
    const key = usageEventKey({
      provider: CURSOR_PROVIDER,
      accountId: 'company-ultra',
      pool: DEFAULT_CURSOR_POOL,
      providerEventId: 'refresh',
    });
    const first = beginRefresh(ledger, key, { now: NOW });
    const second = beginRefresh(first.ledger, key, { now: NOW + 1_000 });
    assert.equal(first.started, true);
    assert.equal(second.coalesced, true);
    ledger = endRefresh(first.ledger, key, { error: 'provider-429', now: NOW + 2_000 });
    assert.equal(refreshAllowed(ledger, key, NOW + 3_000), false);
    assert.equal(refreshAllowed(ledger, key, NOW + 120_000), true);
  });

  test('batch reset grant is separate with provenance and expiry', () => {
    let ledger = createEmptyLedger();
    const grant = {
      schema: GRANT_SCHEMA,
      provider: CURSOR_PROVIDER,
      accountId: 'company-ultra',
      pool: DEFAULT_CURSOR_POOL,
      grantId: 'codex-batch-reset-1',
      provenance: 'provider-reset-credit',
      observedAt: '2026-11-18T22:00:00Z',
      expiresAt: '2026-11-19T22:00:00Z',
    };
    const applied = appendResetGrant(ledger, grant);
    assert.equal(applied.applied, true);
    const duplicate = appendResetGrant(applied.ledger, grant);
    assert.equal(duplicate.duplicate, true);
    const state = readPoolState(applied.ledger, {
      provider: CURSOR_PROVIDER,
      accountId: 'company-ultra',
      pool: DEFAULT_CURSOR_POOL,
      now: NOW,
    });
    assert.equal(state.grant.grantId, 'codex-batch-reset-1');
  });

  test('ovie projection is read-only and omits email from receipts', () => {
    let ledger = createEmptyLedger();
    ledger = ingestQuota(ledger, quotaFixture.transcript, quotaFixture, { now: NOW }).ledger;
    const projection = projectOvieUsagePools(ledger, { now: NOW });
    assert.equal(projection.schema, 'jovie.usage-ledger-ovie-projection/v1');
    assert.equal(projection.controls, 'read-only');
    assert.equal(projection.pools.length, 1);
    assert.doesNotMatch(JSON.stringify(projection), /@/);
    assert.doesNotMatch(JSON.stringify(projection), /receipt/i);
  });

  test('cursor plan snapshot parser matches verified fixture', () => {
    const snapshot = cursorPlanSnapshotFromAbout(planFixture, {
      accountId: 'company-ultra',
      observedAt: planFixture.observedAt,
    });
    assert.equal(snapshot.tier, 'ultra');
    assert.equal(snapshot.pools[0].id, DEFAULT_CURSOR_POOL);
    assert.equal(snapshot.schema, PLAN_SCHEMA);
  });
});