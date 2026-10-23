/**
 * Ovie Home stage-time strip: end-to-end 7-day spans (p50 / p95) from the
 * stage summary, then flow p95s from the lanes feed. Pure and formatted;
 * unknown values are left out rather than shown as zero.
 */

import {
  formatDurationSeconds,
  type HomeLoopStripItem,
} from '@/lib/home-loop/contract';
import type { DeliverySummary } from '@/lib/ovie/shipping-state/contract';
import { stageLabel } from './shipping-home';

export interface OvieStageStrip {
  readonly items: readonly HomeLoopStripItem[];
  readonly coverage: string | null;
}

export function buildStageStrip(delivery: DeliverySummary): OvieStageStrip {
  const summary = delivery.lanes.stageSummary ?? null;
  const flow = delivery.lanes.flow ?? null;
  const items: HomeLoopStripItem[] = [];

  for (const span of summary?.endToEnd7d ?? []) {
    if (span.p50 === null && span.p95 === null) continue;
    items.push({
      id: `span:${span.pipeline}`,
      label: stageLabel(span.pipeline),
      value: `${formatDurationSeconds(span.p50)} / ${formatDurationSeconds(span.p95)}`,
      tone: span.regressed ? 'bad' : 'neutral',
    });
  }
  if (items.length === 0) {
    for (const stage of (summary?.slowestP95 ?? []).slice(0, 3)) {
      if (stage.p95 === null) continue;
      items.push({
        id: `stage:${stage.stage}`,
        label: `${stageLabel(stage.stage)} P95`,
        value: formatDurationSeconds(stage.p95),
        tone: summary?.regressions.includes(`${stage.stage}.p95`)
          ? 'bad'
          : 'neutral',
      });
    }
  }

  const regressed = new Set(flow?.regressions ?? []);
  if (flow?.queueWaitP95Seconds != null)
    items.push({
      id: 'flow:queue-wait',
      label: 'Queue Wait P95',
      value: formatDurationSeconds(flow.queueWaitP95Seconds),
      tone: regressed.has('merge_queue.wait.p95') ? 'bad' : 'neutral',
    });
  if (flow?.productionLagP95Seconds != null)
    items.push({
      id: 'flow:prod-lag',
      label: 'Prod Lag P95',
      value: formatDurationSeconds(flow.productionLagP95Seconds),
      // A regressed merged-to-verified SLO outranks the one-day warn.
      tone: regressed.has('production_lag.merged_to_verified.p95')
        ? 'bad'
        : flow.productionLagP95Seconds > 86_400
          ? 'warn'
          : 'neutral',
    });
  if (regressed.size > 0)
    items.push({
      id: 'flow:regressions',
      label: 'SLO Regressions',
      value: String(regressed.size),
      tone: 'bad',
    });

  return {
    items,
    coverage:
      summary && summary.stagesWithData !== null && summary.stagesTotal !== null
        ? `${summary.stagesWithData} of ${summary.stagesTotal} stages measured`
        : summary
          ? null
          : 'Stage events not published yet',
  };
}
