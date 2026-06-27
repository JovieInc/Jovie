import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildWarRoomHudSnapshot,
  parseWarRoomLedger,
  type WarRoomLedger,
} from '@/lib/admin/war-room';

const LEDGER_PATH = resolve(process.cwd(), 'lib/admin/war-room-ledger.json');

function loadCommittedLedger(): WarRoomLedger {
  const raw = JSON.parse(readFileSync(LEDGER_PATH, 'utf8')) as unknown;
  const parsed = parseWarRoomLedger(raw);
  if (!parsed.ledger) {
    throw new Error(
      `Committed war-room ledger is invalid: ${parsed.issues
        .map(issue => `${issue.path}: ${issue.message}`)
        .join('; ')}`
    );
  }
  return parsed.ledger;
}

describe('war-room ledger', () => {
  it('parses the committed ledger without validation issues', () => {
    const raw = JSON.parse(readFileSync(LEDGER_PATH, 'utf8')) as unknown;
    const parsed = parseWarRoomLedger(raw);

    expect(parsed.issues).toEqual([]);
    expect(parsed.ledger?.cashConstraintUsd).toBe(400);
    expect(parsed.ledger?.cashTruth.balanceUsd).toBe(400);
    expect(parsed.ledger?.burnFreeze.active).toBe(true);
    expect(parsed.ledger?.dailyDecisions).toHaveLength(5);
  });

  it('rejects invalid vendor actions', () => {
    const ledger = loadCommittedLedger();
    const parsed = parseWarRoomLedger({
      ...ledger,
      vendors: [
        {
          ...ledger.vendors[0],
          action: 'pause',
        },
      ],
    });

    expect(parsed.ledger).toBeNull();
    expect(parsed.issues.some(issue => issue.path.includes('action'))).toBe(
      true
    );
  });
});

describe('buildWarRoomHudSnapshot', () => {
  it('flags critical runway and cash mismatch alerts', () => {
    const ledger = loadCommittedLedger();
    const snapshot = buildWarRoomHudSnapshot({
      ledger,
      ledgerPath: LEDGER_PATH,
      live: {
        balanceUsd: 250,
        burnRateUsd: 3_000,
        mrrUsd: 500,
        mercuryAvailable: true,
        stripeAvailable: true,
      },
      generatedAt: new Date('2026-06-27T12:00:00.000Z'),
    });

    expect(snapshot.runwayDays).toBeCloseTo(3, 1);
    expect(snapshot.defaultStatus).toBe('dead');
    expect(snapshot.alerts.some(alert => alert.id === 'cash-mismatch')).toBe(
      true
    );
    expect(snapshot.alerts.some(alert => alert.id === 'runway-critical')).toBe(
      true
    );
    expect(snapshot.operatingInvariantCompliant).toBe(false);
  });

  it('treats non-burning companies as default alive', () => {
    const ledger = loadCommittedLedger();
    const snapshot = buildWarRoomHudSnapshot({
      ledger,
      ledgerPath: LEDGER_PATH,
      live: {
        balanceUsd: 400,
        burnRateUsd: 200,
        mrrUsd: 500,
        mercuryAvailable: true,
        stripeAvailable: true,
      },
    });

    expect(snapshot.netBurnMonthlyUsd).toBeLessThan(0);
    expect(snapshot.defaultStatus).toBe('alive');
    expect(snapshot.defaultStatusDetail).toContain('Revenue already exceeds');
  });

  it('lists payments due within 14 days from the ledger', () => {
    const ledger = loadCommittedLedger();
    const snapshot = buildWarRoomHudSnapshot({
      ledger,
      ledgerPath: LEDGER_PATH,
      generatedAt: new Date('2026-06-27T12:00:00.000Z'),
    });

    expect(snapshot.nextPaymentsDue14d).toHaveLength(2);
    expect(snapshot.nextPaymentsDue14d[0]?.label).toBe('Vercel team plan');
  });

  it('emits HUD-ready JSON with schema version and alerts array', () => {
    const ledger = loadCommittedLedger();
    const snapshot = buildWarRoomHudSnapshot({
      ledger,
      ledgerPath: LEDGER_PATH,
    });

    const serialized = JSON.parse(JSON.stringify(snapshot)) as Record<
      string,
      unknown
    >;

    expect(serialized.schemaVersion).toBe(1);
    expect(serialized.generatedAtIso).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(Array.isArray(serialized.alerts)).toBe(true);
    expect(Array.isArray(serialized.dailyDecisions)).toBe(true);
    expect(serialized.cashConstraintUsd).toBe(400);
  });
});
