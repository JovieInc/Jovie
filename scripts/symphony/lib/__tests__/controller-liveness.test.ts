import { describe, expect, it } from 'vitest';

import {
  buildControllerLivenessReceipt,
  CONTROLLER_LIVENESS_SCHEMA,
  CONTROLLER_LIVENESS_STALE_MS,
  evaluateController,
  readControllerCheckins,
  readGemCheckin,
  readMacCheckin,
} from '../controller-liveness';

const NOW = new Date('2026-09-06T18:00:00.000Z');
const FRESH = '2026-09-06T17:58:00.000Z'; // 2 minutes old
const STALE = '2026-09-06T17:54:00.000Z'; // 6 minutes old

function alive(): () => boolean {
  return () => true;
}

function dead(): () => boolean {
  return () => false;
}

function macCheckin(
  overrides: { observedAt?: string; pid?: number | null } = {}
) {
  return {
    kind: 'mac' as const,
    observedAt: overrides.observedAt ?? FRESH,
    pid: overrides.pid ?? 1,
    evidence: 'ship-owner.lock:test',
  };
}

function gemCheckin(
  overrides: { observedAt?: string; pid?: number | null } = {}
) {
  return {
    kind: 'gem' as const,
    observedAt: overrides.observedAt ?? FRESH,
    pid: overrides.pid ?? 1,
    evidence: 'gem-ship-hud-attestation:test',
  };
}

describe('read checkins', () => {
  it('reads the mac ship-owner lock format', () => {
    const path = new URL('fixtures/mac-ship-owner-lock.json', import.meta.url)
      .pathname;
    const checkin = readMacCheckin(path);
    expect(checkin).toMatchObject({
      kind: 'mac',
      pid: 12345,
      evidence: `ship-owner.lock:${path}`,
    });
  });

  it('reads the gem attestation format', () => {
    const path = new URL(
      'fixtures/gem-ship-hud-attestation.json',
      import.meta.url
    ).pathname;
    const checkin = readGemCheckin(path);
    expect(checkin).toMatchObject({
      kind: 'gem',
      pid: 12345,
      evidence: `gem-ship-hud-attestation:${path}`,
    });
  });

  it('returns null for missing files', () => {
    expect(readMacCheckin('/nonexistent/lock.json')).toBeNull();
    expect(readGemCheckin('/nonexistent/attestation.json')).toBeNull();
    expect(
      readControllerCheckins({
        mac: '/nonexistent/lock.json',
        gem: '/nonexistent/attestation.json',
      })
    ).toEqual({ mac: null, gem: null });
  });
});

describe('evaluateController', () => {
  it('returns null for a healthy controller', () => {
    expect(
      evaluateController('mac', macCheckin(), { now: NOW, isAlive: alive() })
    ).toBeNull();
  });

  it('flags a missing controller', () => {
    const violation = evaluateController('gem', null, { now: NOW });
    expect(violation).not.toBeNull();
    expect(violation?.status).toBe('missing');
    expect(violation?.owner).toBe('gem');
    expect(violation?.nextAction).toBe('reconcile-gem-ship-hud-service');
  });

  it('flags a stale controller', () => {
    const violation = evaluateController(
      'mac',
      macCheckin({ observedAt: STALE }),
      { now: NOW, isAlive: alive() }
    );
    expect(violation?.status).toBe('stale');
    expect(violation?.ageMs).toBeGreaterThanOrEqual(
      CONTROLLER_LIVENESS_STALE_MS
    );
  });

  it('flags a dead controller', () => {
    const violation = evaluateController('gem', gemCheckin(), {
      now: NOW,
      isAlive: dead(),
    });
    expect(violation?.status).toBe('dead');
    expect(violation?.reason).toBe('recorded process is dead');
  });

  it('uses a custom stale bound', () => {
    const violation = evaluateController(
      'mac',
      macCheckin({ observedAt: FRESH }),
      { now: NOW, staleAfterMs: 10_000, isAlive: alive() }
    );
    expect(violation?.status).toBe('stale');
    expect(violation?.reason).toContain('10000ms');
  });

  it('treats a future timestamp as stale', () => {
    const future = '2026-09-06T18:05:00.000Z';
    const violation = evaluateController(
      'mac',
      macCheckin({ observedAt: future }),
      { now: NOW, isAlive: alive() }
    );
    expect(violation?.status).toBe('stale');
    expect(violation?.reason).toContain('future');
  });
});

describe('buildControllerLivenessReceipt', () => {
  it('reports healthy when both controllers are live', () => {
    const receipt = buildControllerLivenessReceipt(
      { mac: macCheckin(), gem: gemCheckin() },
      { now: NOW, isAlive: alive() }
    );
    expect(receipt.schema).toBe(CONTROLLER_LIVENESS_SCHEMA);
    expect(receipt.status).toBe('healthy');
    expect(receipt.violations).toHaveLength(0);
    expect(receipt.recoveryLane.authorized).toBe(false);
    expect(receipt.recoveryLane.reason).toBe('all controllers healthy');
    expect(receipt.controllers).toHaveLength(2);
  });

  it('reports dark and authorizes the recovery lane when mac is missing', () => {
    const receipt = buildControllerLivenessReceipt(
      { mac: null, gem: gemCheckin() },
      { now: NOW, isAlive: alive() }
    );
    expect(receipt.status).toBe('dark');
    expect(receipt.violations).toHaveLength(1);
    expect(receipt.violations[0].kind).toBe('mac');
    expect(receipt.violations[0].status).toBe('missing');
    expect(receipt.recoveryLane.authorized).toBe(true);
    expect(receipt.recoveryLane.reason).toBe('controller-dark:mac');
  });

  it('reports dark and authorizes the recovery lane when gem is stale', () => {
    const receipt = buildControllerLivenessReceipt(
      { mac: macCheckin(), gem: gemCheckin({ observedAt: STALE }) },
      { now: NOW, isAlive: alive() }
    );
    expect(receipt.status).toBe('dark');
    expect(receipt.violations[0].kind).toBe('gem');
    expect(receipt.violations[0].status).toBe('stale');
    expect(receipt.recoveryLane.authorized).toBe(true);
    expect(receipt.recoveryLane.reason).toBe('controller-dark:gem');
  });

  it('names both controllers when both are dark', () => {
    const receipt = buildControllerLivenessReceipt(
      { mac: null, gem: gemCheckin({ observedAt: STALE }) },
      { now: NOW, isAlive: alive() }
    );
    expect(receipt.status).toBe('dark');
    expect(receipt.violations).toHaveLength(2);
    expect(receipt.recoveryLane.reason).toBe('controller-dark:mac,gem');
  });

  it('uses the provided stale threshold', () => {
    const receipt = buildControllerLivenessReceipt(
      { mac: macCheckin(), gem: gemCheckin() },
      { now: NOW, staleAfterMs: 10_000, isAlive: alive() }
    );
    expect(receipt.status).toBe('dark');
    expect(receipt.staleAfterMs).toBe(10_000);
  });

  it('observedAt matches the provided clock', () => {
    const receipt = buildControllerLivenessReceipt(
      { mac: macCheckin(), gem: gemCheckin() },
      { now: NOW, isAlive: alive() }
    );
    expect(receipt.observedAt).toBe(NOW.toISOString());
  });
});
