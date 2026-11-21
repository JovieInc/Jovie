import 'server-only';

import type { CertificationReviewPacket } from '@/lib/agent-os/certification';
import type { CertificationRecordBackend } from '@/lib/agent-os/certification-adapter';
import type {
  DogfoodMissionSpec,
  DogfoodProduct,
} from '@/lib/agent-os/dogfood-receipt';
import {
  CANONICAL_SURFACE_IDS,
  type CanonicalSurfaceId,
  getCanonicalSurface,
} from '@/lib/canonical-surfaces';
import { postgresRecordBackend } from '@/lib/ovie/mcp/postgres-backend';
import { listSummerCards } from '@/lib/ovie/summer-cards.server';
import {
  dogfoodFeedStatus,
  readDogfoodReceiptLedger,
} from './dogfood-receipt-ledger';
import {
  CERTIFICATION_RISK_CLASSES,
  type CertificationMetricsProjection,
  type CertificationRiskClass,
  computeCertificationMetrics,
  type MetricsFounderCard,
  type MetricsFounderDecision,
  type MetricsSubject,
} from './metrics';
import { readPacketDecisionLedger } from './packet-decisions';
import {
  PACKET_FILE_DOMAINS,
  readCertificationPacketFiles,
} from './packet-files.server';
import { readQualityScoreboardLedger } from './quality-scoreboard-ledger';

/**
 * Server adapter for the section 8 metrics projection. Subjects, founder
 * decisions, and founder-facing cards are read from the same stores the
 * inventory uses — committed packet files, the packet decision ledger, and
 * the Summer card log. Dogfood receipts, subject deploy bindings, and
 * known-good deployment ids come from
 * `jovie:certification:v1:dogfood-receipts` when present (JOV-7200). Required
 * missions are projected from canonical-surface outcome definitions for
 * matching subject ids. Judge-panel receipts, the signal roster, and defect
 * linkage still have no authoritative adapter feed and stay empty so those
 * metrics report `null` rather than a fake zero.
 */

export const CERTIFICATION_METRICS_WINDOW_DAYS = 30 as const;

const CANONICAL_SURFACE_ID_SET = new Set<string>(CANONICAL_SURFACE_IDS);

export interface CertificationMetricsDeps {
  readonly backend: () => CertificationRecordBackend;
  readonly readPacketFiles: typeof readCertificationPacketFiles;
  readonly listCards: typeof listSummerCards;
}

export const defaultCertificationMetricsDeps: CertificationMetricsDeps = {
  backend: postgresRecordBackend,
  readPacketFiles: readCertificationPacketFiles,
  listCards: listSummerCards,
};

/**
 * v2 makes `subject.product` and a surface risk class required. v1 packets do
 * not carry them; until a packet opts in, it reports under the `jov` lane and
 * `product` risk class so nothing silently drops out of the denominators.
 */
function subjectProduct(packet: CertificationReviewPacket): DogfoodProduct {
  const value = (packet.subject as { product?: unknown }).product;
  return value === 'lyb' || value === 'ovie' ? value : 'jov';
}

function subjectRiskClass(
  packet: CertificationReviewPacket
): CertificationRiskClass {
  const value = (packet.subject as { riskClass?: unknown }).riskClass;
  return (CERTIFICATION_RISK_CLASSES as readonly unknown[]).includes(value)
    ? (value as CertificationRiskClass)
    : 'product';
}

/** Map packet subject ids onto canonical surface outcome missions when present. */
export function requiredMissionsForSubject(
  subjectId: string
): readonly DogfoodMissionSpec[] {
  if (!CANONICAL_SURFACE_ID_SET.has(subjectId)) return [];
  const mission = getCanonicalSurface(
    subjectId as CanonicalSurfaceId
  ).outcomeMission;
  return [
    {
      id: mission.id,
      required: mission.required ?? true,
      outcome: mission.outcome,
    },
  ];
}

export async function readCertificationMetrics(
  deps: CertificationMetricsDeps = defaultCertificationMetricsDeps,
  generatedAt: string = new Date().toISOString()
): Promise<CertificationMetricsProjection> {
  const windowStart = new Date(
    Date.parse(generatedAt) - CERTIFICATION_METRICS_WINDOW_DAYS * 86_400_000
  ).toISOString();

  const packetRead = await deps.readPacketFiles();
  const backend = deps.backend();
  const qualityLedger = await readQualityScoreboardLedger(backend);
  const dogfoodLedger = await readDogfoodReceiptLedger(backend);

  const subjects: MetricsSubject[] = [];
  const decisions: MetricsFounderDecision[] = [];

  for (const domain of PACKET_FILE_DOMAINS) {
    const files = packetRead.files.filter(file => file.domain === domain);
    if (files.length === 0) continue;
    let ledger;
    try {
      ledger = await readPacketDecisionLedger(backend, domain);
    } catch {
      // Fail closed like the inventory: an unreadable ledger means founder
      // decisions could be missing, so the whole read reports unavailable.
      throw new Error(`decision ledger unavailable for ${domain}`);
    }
    for (const file of files) {
      const packet = file.packet;
      const subjectId = packet.subject.id;
      const deployBinding = dogfoodLedger?.subjectDeploys[subjectId] ?? null;
      subjects.push({
        id: subjectId,
        product: subjectProduct(packet),
        riskClass: subjectRiskClass(packet),
        requiredMissions: requiredMissionsForSubject(subjectId),
        deploy: deployBinding
          ? {
              commitSha: deployBinding.commitSha,
              deploymentId: deployBinding.deploymentId,
            }
          : null,
        confidenceTier: null,
        machineCertifiedAt: null,
        fullyRolledOutAt: null,
        promotedSilently: false,
        killedAfterPromotion: false,
        founderFlaggedAfterPromotion: false,
        founderBlocking: [],
        killSwitches: [],
        escalationRungResolved: null,
        hasCanary: false,
      });
      for (const decision of ledger.records[subjectId]?.decisions ?? []) {
        decisions.push({
          subjectId: decision.subjectId,
          decision: decision.decision,
          decidedAt: decision.decidedAt,
        });
      }
    }
  }

  // Founder cards per day: Taste Inbox outreach to Tim is a Summer card of
  // kind `taste` (and `decision` cards are the same founder ask). Only cards
  // that exist reached Tim — the escalation chain filters before filing.
  let founderCards: MetricsFounderCard[] = [];
  try {
    const cards = await deps.listCards({
      status: 'all',
      since: windowStart,
      limit: 100,
    });
    founderCards = cards
      .filter(card => card.kind === 'taste' || card.kind === 'decision')
      .map(card => ({
        id: card.id,
        subjectId: card.recipient ?? card.id,
        product: card.product === 'lyb' ? 'lyb' : 'jov',
        createdAt: card.createdAt,
      }));
  } catch {
    founderCards = [];
  }

  const feed = dogfoodFeedStatus(dogfoodLedger);
  const subjectsWithRequiredMissions = subjects.filter(
    subject => subject.requiredMissions.length > 0
  ).length;

  return computeCertificationMetrics({
    generatedAt,
    windowStart,
    subjects,
    defects: [],
    founderCards,
    judgeReceipts: [],
    decisions,
    signalReports: [],
    roster: [],
    receipts: dogfoodLedger ? Object.values(dogfoodLedger.receipts) : [],
    knownGoodDeploymentIds: dogfoodLedger?.knownGoodDeploymentIds ?? [],
    qualityReceipts: qualityLedger
      ? Object.values(qualityLedger.receipts)
      : null,
    dogfoodFeed: {
      status: feed.status,
      receiptCount: feed.receiptCount,
      subjectsWithRequiredMissions,
      subjectsWithDeploy: feed.subjectsWithDeploy,
      knownGoodDeploymentCount: feed.knownGoodDeploymentCount,
    },
  });
}
