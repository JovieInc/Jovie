import { createRequire } from 'node:module';
import { evaluateShrinkOnlyCount } from '../lib/design/shrink-only-count-ratchet';
import { machineTextReasons } from '../lib/presentation/contracts';

const { isTitleCase, isSentenceCase } = createRequire(import.meta.url)(
  '../eslint-rules/canonical-ui-label-casing-utils.js'
) as {
  isTitleCase: (text: string) => boolean;
  isSentenceCase: (text: string) => boolean;
};

export interface DogfoodSample {
  readonly id: string;
  readonly source: string;
  readonly visibleText: readonly string[];
  readonly route?: {
    readonly navLabel: string;
    readonly heading: string;
    readonly documentTitle: string;
    readonly brand: string;
  };
  readonly buttons: readonly {
    readonly height: number;
    readonly text: string;
  }[];
  readonly labels: readonly {
    readonly text: string;
    readonly casing: 'title' | 'sentence';
  }[];
  readonly columns: readonly {
    readonly name: string;
    readonly cells: readonly (string | number | null | undefined)[];
  }[];
}

export const DOGFOOD_METRICS = [
  'machineText',
  'routeTitle',
  'buttonHeight',
  'casing',
  'emptyColumn',
] as const;
export type DogfoodMetric = (typeof DOGFOOD_METRICS)[number];
export type DogfoodCounts = Record<DogfoodMetric, number>;
export interface DogfoodFinding {
  readonly sample: string;
  readonly metric: DogfoodMetric;
  readonly detail: string;
}

/** Counts observations, not regex matches. Findings never include visible text/IDs. */
export function scanDogfood(samples: readonly DogfoodSample[]) {
  const counts: DogfoodCounts = {
    machineText: 0,
    routeTitle: 0,
    buttonHeight: 0,
    casing: 0,
    emptyColumn: 0,
  };
  const findings: DogfoodFinding[] = [];
  for (const sample of samples) {
    const warn = (metric: DogfoodMetric, detail: string) => {
      counts[metric]++;
      findings.push({ sample: sample.id, metric, detail });
    };
    for (const text of sample.visibleText) {
      const reasons = machineTextReasons(text);
      if (reasons.length) warn('machineText', reasons.join(', '));
    }
    const route = sample.route;
    if (
      route &&
      (route.navLabel !== route.heading ||
        route.documentTitle !== `${route.navLabel} | ${route.brand}`)
    )
      warn(
        'routeTitle',
        'Nav, heading, or single-suffix document title differs'
      );
    for (const button of sample.buttons) {
      if (
        button.text.trim() &&
        ![28, 32].some(height => Math.abs(height - button.height) <= 0.5)
      )
        warn('buttonHeight', `Observed height: ${button.height}`);
    }
    for (const label of sample.labels) {
      if (
        !(label.casing === 'title' ? isTitleCase : isSentenceCase)(label.text)
      )
        warn('casing', `Expected ${label.casing} case`);
    }
    for (const column of sample.columns) {
      const empty = column.cells.filter(
        cell =>
          cell == null ||
          (typeof cell === 'string' &&
            ['', '—', '–', '-'].includes(cell.trim()))
      ).length;
      if (column.cells.length && empty / column.cells.length > 0.9)
        warn('emptyColumn', `${empty}/${column.cells.length} empty cells`);
    }
  }
  return { counts, findings };
}

/** Existing ratchet supplies comparison only; no blocking verdict escapes. */
export function reportDogfood(
  samples: readonly DogfoodSample[],
  baseline: DogfoodCounts
) {
  const { counts, findings } = scanDogfood(samples);
  const metrics = DOGFOOD_METRICS.map(metric => ({
    metric,
    count: counts[metric],
    baseline: baseline[metric],
    delta: counts[metric] - baseline[metric],
    status: evaluateShrinkOnlyCount({
      metric,
      count: counts[metric],
      baseline: baseline[metric],
      event: 'local',
    }).status,
  }));
  return {
    mode: 'warn-only' as const,
    samples: samples.length,
    metrics,
    findings,
  };
}
