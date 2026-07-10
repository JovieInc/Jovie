/**
 * Campaign monitoring + next-move recommendations (JOV-2212).
 *
 * Aggregates event counters into health snapshots and emits typed next moves
 * from threshold rules. Pause/resume is an explicit flag on the snapshot path.
 */

import type {
  CampaignEventCounters,
  CampaignHealthSnapshot,
  CampaignHealthStatus,
  NextMoveKind,
  NextMoveRecommendation,
} from './types';

export interface MonitoringThresholds {
  readonly minClicksForHealth: number;
  readonly minConversionRate: number;
  readonly strongConversionRate: number;
  readonly lowReplyRate: number;
  readonly minPurchasesForExtend: number;
}

export const DEFAULT_MONITORING_THRESHOLDS: MonitoringThresholds =
  Object.freeze({
    minClicksForHealth: 20,
    minConversionRate: 0.01,
    strongConversionRate: 0.04,
    lowReplyRate: 0.02,
    minPurchasesForExtend: 10,
  });

export function computeConversionRate(counters: CampaignEventCounters): number {
  if (counters.clicks <= 0) return 0;
  return counters.purchases / counters.clicks;
}

export function computeReplyRate(counters: CampaignEventCounters): number {
  if (counters.clicks <= 0) return 0;
  return counters.replies / counters.clicks;
}

function healthStatus(
  counters: CampaignEventCounters,
  conversionRate: number,
  paused: boolean,
  thresholds: MonitoringThresholds
): CampaignHealthStatus {
  if (paused) return 'paused';

  const anyChannelOff = Object.values(counters.channelStatuses).some(
    s => s === 'off'
  );
  const anyDegraded = Object.values(counters.channelStatuses).some(
    s => s === 'degraded'
  );

  if (
    anyChannelOff ||
    (counters.clicks >= thresholds.minClicksForHealth &&
      conversionRate < thresholds.minConversionRate)
  ) {
    return 'at_risk';
  }
  if (anyDegraded || conversionRate < thresholds.strongConversionRate) {
    return 'watch';
  }
  if (counters.clicks < thresholds.minClicksForHealth) {
    return 'watch';
  }
  return 'healthy';
}

export function buildCampaignHealthSnapshot(input: {
  readonly campaignId: string;
  readonly counters: CampaignEventCounters;
  readonly paused?: boolean;
  readonly now?: string;
  readonly thresholds?: MonitoringThresholds;
}): CampaignHealthSnapshot {
  const thresholds = input.thresholds ?? DEFAULT_MONITORING_THRESHOLDS;
  const conversionRate = computeConversionRate(input.counters);
  const paused = input.paused ?? false;

  return {
    campaignId: input.campaignId,
    status: healthStatus(input.counters, conversionRate, paused, thresholds),
    counters: input.counters,
    conversionRate: Number(conversionRate.toFixed(6)),
    capturedAt: input.now ?? new Date().toISOString(),
    paused,
  };
}

function moveId(kind: NextMoveKind, campaignId: string): string {
  return `move_${kind}_${campaignId}`;
}

/**
 * Threshold → typed next-move recommendations with evidence.
 * Dedupes by kind (at most one recommendation per kind).
 */
export function recommendNextMoves(
  snapshot: CampaignHealthSnapshot,
  thresholds: MonitoringThresholds = DEFAULT_MONITORING_THRESHOLDS
): NextMoveRecommendation[] {
  if (snapshot.paused) {
    return [];
  }

  const { counters, conversionRate, campaignId } = snapshot;
  const moves: NextMoveRecommendation[] = [];
  const seen = new Set<NextMoveKind>();

  const push = (move: NextMoveRecommendation) => {
    if (seen.has(move.kind)) return;
    seen.add(move.kind);
    moves.push(move);
  };

  const degradedChannels = (
    Object.entries(counters.channelStatuses) as [
      keyof typeof counters.channelStatuses,
      string,
    ][]
  )
    .filter(([, status]) => status === 'degraded' || status === 'off')
    .map(([channel]) => channel);

  if (degradedChannels.length > 0) {
    push({
      id: moveId('boost_channel', campaignId),
      kind: 'boost_channel',
      title: 'Repair or boost degraded channels',
      evidence: [
        `Channels not healthy: ${degradedChannels.join(', ')}`,
        `${counters.clicks} clicks captured so far`,
      ],
      expectedImpact:
        'Restore delivery so click and purchase volume can recover.',
      confidence: 0.8,
    });
  }

  if (
    counters.clicks >= thresholds.minClicksForHealth &&
    conversionRate < thresholds.minConversionRate
  ) {
    push({
      id: moveId('retarget_segment', campaignId),
      kind: 'retarget_segment',
      title: 'Retarget a warmer segment',
      evidence: [
        `Conversion rate ${(conversionRate * 100).toFixed(2)}% below ${(thresholds.minConversionRate * 100).toFixed(2)}% floor`,
        `${counters.purchases} purchases from ${counters.clicks} clicks`,
      ],
      expectedImpact:
        'Lift conversion by focusing on buyers, subscribers, and recent clickers.',
      confidence: 0.75,
    });
  }

  if (
    conversionRate >= thresholds.strongConversionRate &&
    counters.purchases >= thresholds.minPurchasesForExtend
  ) {
    push({
      id: moveId('extend_window', campaignId),
      kind: 'extend_window',
      title: 'Extend the drop window',
      evidence: [
        `Strong conversion ${(conversionRate * 100).toFixed(2)}%`,
        `${counters.purchases} purchases already fulfilled`,
      ],
      expectedImpact:
        'Capture residual demand while conversion remains healthy.',
      confidence: 0.7,
    });
  }

  const replyRate = computeReplyRate(counters);
  if (
    counters.clicks >= thresholds.minClicksForHealth &&
    replyRate < thresholds.lowReplyRate
  ) {
    push({
      id: moveId('follow_up_content', campaignId),
      kind: 'follow_up_content',
      title: 'Ship follow-up content',
      evidence: [
        `Reply rate ${(replyRate * 100).toFixed(2)}% is low`,
        `${counters.replies} replies vs ${counters.clicks} clicks`,
      ],
      expectedImpact: 'Re-engage clickers who have not purchased or replied.',
      confidence: 0.65,
    });
  }

  if (
    snapshot.status === 'healthy' &&
    counters.purchases >= thresholds.minPurchasesForExtend &&
    counters.optIns > 0
  ) {
    push({
      id: moveId('close_and_report', campaignId),
      kind: 'close_and_report',
      title: 'Prepare close-out report',
      evidence: [
        `Campaign healthy with ${counters.purchases} purchases`,
        `${counters.optIns} new opt-ins captured`,
      ],
      expectedImpact:
        'Lock learnings and queue the next release or drop moment.',
      confidence: 0.6,
    });
  }

  return moves;
}

export function pauseMonitoring(
  snapshot: CampaignHealthSnapshot,
  now?: string
): CampaignHealthSnapshot {
  return {
    ...snapshot,
    paused: true,
    status: 'paused',
    capturedAt: now ?? new Date().toISOString(),
  };
}

export function resumeMonitoring(
  snapshot: CampaignHealthSnapshot,
  now?: string,
  thresholds?: MonitoringThresholds
): CampaignHealthSnapshot {
  return buildCampaignHealthSnapshot({
    campaignId: snapshot.campaignId,
    counters: snapshot.counters,
    paused: false,
    now,
    thresholds,
  });
}
