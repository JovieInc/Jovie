import 'server-only';

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getAdminMercuryMetrics } from '@/lib/admin/mercury-metrics';
import { getAdminStripeOverviewMetrics } from '@/lib/admin/stripe-metrics';
import {
  buildWarRoomHudSnapshot,
  parseWarRoomLedger,
  type WarRoomHudSnapshot,
} from '@/lib/admin/war-room';

const WAR_ROOM_LEDGER_PATH = resolve(
  process.cwd(),
  'lib/admin/war-room-ledger.json'
);

export function getWarRoomLedgerPath(): string {
  return WAR_ROOM_LEDGER_PATH;
}

export function loadWarRoomLedgerFromFile(
  filePath = WAR_ROOM_LEDGER_PATH
): ReturnType<typeof parseWarRoomLedger> {
  const raw = JSON.parse(readFileSync(filePath, 'utf8')) as unknown;
  return parseWarRoomLedger(raw);
}

export async function getWarRoomHudSnapshot(
  filePath = WAR_ROOM_LEDGER_PATH
): Promise<WarRoomHudSnapshot> {
  const parsed = loadWarRoomLedgerFromFile(filePath);

  if (!parsed.ledger) {
    return buildWarRoomHudSnapshot({
      ledger: {
        schemaVersion: 1,
        lastVerifiedAt: null,
        lastVerifiedBy: null,
        cashConstraintUsd: 400,
        cashTruth: {
          balanceUsd: 400,
          verified: false,
          source: 'fallback',
          notes: 'Ledger failed validation; using safe fallback.',
        },
        burnFreeze: {
          active: true,
          effectiveAt: new Date().toISOString().slice(0, 10),
          notes: 'Burn freeze assumed active until ledger is repaired.',
        },
        vendors: [],
        nextPayments: [],
        bridgePipeline: {
          targetCount: 20,
          identifiedCount: 0,
          status: 'not_started',
          notes: 'Bridge pipeline unavailable until ledger is repaired.',
        },
        acceleratorFacts: {
          program: 'YC',
          submissionStatus: 'unknown',
          deadlineNote:
            'Accelerator facts unavailable until ledger is repaired.',
          cashUsd: 400,
          runwayDays: null,
          mrrUsd: null,
          activeUsers: null,
          lastReconciledAt: null,
        },
        dailyDecisions: [],
      },
      ledgerPath: filePath,
      validationIssues: parsed.issues,
    });
  }

  const [mercuryMetrics, stripeMetrics] = await Promise.all([
    getAdminMercuryMetrics(),
    getAdminStripeOverviewMetrics(),
  ]);

  return buildWarRoomHudSnapshot({
    ledger: parsed.ledger,
    ledgerPath: filePath,
    validationIssues: parsed.issues,
    live: {
      balanceUsd: mercuryMetrics.balanceUsd,
      burnRateUsd: mercuryMetrics.burnRateUsd,
      mrrUsd: stripeMetrics.mrrUsd,
      activeSubscribers: stripeMetrics.activeSubscribers,
      mercuryAvailable: mercuryMetrics.isAvailable,
      stripeAvailable: stripeMetrics.isAvailable,
    },
  });
}
