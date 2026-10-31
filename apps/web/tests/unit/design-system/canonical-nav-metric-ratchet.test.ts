import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Jovie and Ovie app routes use canonical primitives for navigation, metrics
 * and unknown values (docs/design-system/ovie-ia.md):
 *
 * - Sub-navigation: `AdminPage views=` / `tabs=`, RouteSegmentControl,
 *   WorkspaceTabsSurface, TabBar. No hand-built `role="tab"` markup or
 *   `<nav>` link rows with `aria-current`.
 * - Metrics: ContentMetricRow / ContentMetricStat / ContentMetricCard /
 *   HomeLoopPulse. No local `*Metric`, `*Stat`, `*Kpi` components.
 * - Missing values: MeasuredValue (state, source, age). No bare "n/a" or em
 *   dash placeholders.
 *
 * Existing debt is grandfathered per file in the baseline and may not grow.
 * A shrink passes with a notice; lower the baseline with
 * UPDATE_NAV_METRIC_BASELINE=1 and commit it.
 */
const WEB_ROOT = path.resolve(import.meta.dirname, '../../..');
const ROOTS = ['app/app/(shell)', 'components/features'];
const BASELINE_PATH = path.join(
  import.meta.dirname,
  'canonical-nav-metric.baseline.json'
);

export const NAV_METRIC_RULES = {
  adHocTabs: /role=\{?['"]tab(?:list|panel)?['"]\}?/g,
  adHocRouteNav: /<nav\b[^>]*>[\s\S]{0,1200}?aria-current=/g,
  localMetricComponent:
    /^(?:export\s+)?(?:function|const)\s+[A-Z]\w*(?:StatCard|MetricCard|Metric|Stat|Stats|Kpi|StatTile|MetricTile)\b/gm,
  barePlaceholder: /(['"`])(?:n\/a|N\/A|—)\1|>\s*(?:n\/a|N\/A|—)\s*</g,
} as const;

export type NavMetricRule = keyof typeof NAV_METRIC_RULES;
type Counts = Record<NavMetricRule, Record<string, number>>;

function sources(dir: string): string[] {
  return readdirSync(path.join(WEB_ROOT, dir), { withFileTypes: true })
    .flatMap(entry => {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) return sources(rel);
      return /\.tsx?$/.test(entry.name) &&
        !/\.(test|stories|spec)\.tsx?$/.test(entry.name)
        ? [rel]
        : [];
    })
    .sort();
}

export function countNavMetric(text: string): Record<NavMetricRule, number> {
  const out = {} as Record<NavMetricRule, number>;
  for (const [rule, pattern] of Object.entries(NAV_METRIC_RULES)) {
    out[rule as NavMetricRule] = text.match(pattern)?.length ?? 0;
  }
  return out;
}

function currentCounts(): Counts {
  const counts = Object.fromEntries(
    Object.keys(NAV_METRIC_RULES).map(rule => [rule, {}])
  ) as Counts;
  for (const file of ROOTS.flatMap(sources)) {
    const found = countNavMetric(
      readFileSync(path.join(WEB_ROOT, file), 'utf8')
    );
    for (const rule of Object.keys(found) as NavMetricRule[]) {
      if (found[rule] > 0) counts[rule][file] = found[rule];
    }
  }
  return counts;
}

describe('canonical navigation, metric and unknown-value ratchet', () => {
  const current = currentCounts();

  if (process.env.UPDATE_NAV_METRIC_BASELINE === '1') {
    writeFileSync(BASELINE_PATH, `${JSON.stringify(current, null, 2)}\n`);
  }

  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as Counts;

  it.each(Object.keys(NAV_METRIC_RULES) as NavMetricRule[])(
    '%s does not grow in any file',
    rule => {
      const grown = Object.entries(current[rule])
        .filter(([file, count]) => count > (baseline[rule]?.[file] ?? 0))
        .map(
          ([file, count]) =>
            `${file}: ${count} > ${baseline[rule]?.[file] ?? 0}`
        );
      expect(grown).toEqual([]);
    }
  );

  it('reports shrunk debt as a notice, never a failure', () => {
    for (const rule of Object.keys(NAV_METRIC_RULES) as NavMetricRule[]) {
      for (const [file, count] of Object.entries(baseline[rule] ?? {})) {
        const now = current[rule][file] ?? 0;
        if (now < count) {
          console.log(
            `::notice title=nav-metric ratchet improved::${rule} ${file} ${count}->${now}; lower the baseline with UPDATE_NAV_METRIC_BASELINE=1`
          );
        }
      }
    }
  });

  it('catches each ad-hoc pattern (deliberate red)', () => {
    expect(
      countNavMetric(
        `<div role='tablist'><button role="tab" aria-selected={a}/>`
      ).adHocTabs
    ).toBe(2);
    expect(
      countNavMetric(`<nav aria-label='x'><Link aria-current='page' /></nav>`)
        .adHocRouteNav
    ).toBe(1);
    expect(
      countNavMetric('function CampaignMetric() {}\nconst DeliveryStats = 1')
        .localMetricComponent
    ).toBe(2);
    expect(
      countNavMetric(`const NOT_MEASURED = 'n/a'; <span>—</span> {'—'}`)
        .barePlaceholder
    ).toBe(3);
    expect(
      countNavMetric(`value ?? 'Unknown'; 'n/a-ish'`).barePlaceholder
    ).toBe(0);
  });

  it('does not classify listbox options or table rows as tab navigation', () => {
    expect(
      countNavMetric(
        `<div role='listbox'><button aria-selected={active} role='option' /></div>`
      ).adHocTabs
    ).toBe(0);
    expect(
      countNavMetric(`<tr role='row' aria-selected={selected} />`).adHocTabs
    ).toBe(0);
  });
});
