import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PerfRouteDefinition } from './performance-route-manifest';
import {
  type SmoothPlatform,
  type SmoothSurfaceDefinition,
  type SmoothSurfaceId,
  smoothBaselineFileName,
  smoothTargetsFor,
} from './performance-smooth-manifest';
import { medianNullable, medianNumber } from './performance-smooth-probes';
import {
  findBaselineRaises,
  type CheckedInSmoothBaseline,
} from './performance-smooth-ratchet';
import {
  SMOOTH_BASELINE_SCHEMA,
  type SmoothBaselineSummary,
  type SmoothRunSample,
  type SmoothSurfaceBaseline,
} from './performance-smooth-types';

export function buildSurfaceBaseline(options: {
  readonly surface: SmoothSurfaceDefinition;
  readonly platform: SmoothPlatform;
  readonly route: PerfRouteDefinition;
  readonly resolvedPath: string;
  readonly baseUrl: string;
  readonly samples: readonly SmoothRunSample[];
  readonly cpuThrottleRate: number;
}): SmoothSurfaceBaseline {
  const {
    surface,
    platform,
    route,
    resolvedPath,
    baseUrl,
    samples,
    cpuThrottleRate,
  } = options;
  const targets = smoothTargetsFor(platform);
  const median = {
    cls: medianNumber(samples.map(sample => sample.cls)),
    lcpMs: medianNumber(samples.map(sample => sample.lcpMs)),
    inpMs: medianNullable(samples.map(sample => sample.inpMs)),
    fcpMs: medianNumber(samples.map(sample => sample.fcpMs)),
    ttfbMs: medianNumber(samples.map(sample => sample.ttfbMs)),
    fullPageReloads: medianNumber(
      samples.map(sample => sample.fullPageReloads)
    ),
    duplicateFetches: medianNumber(
      samples.map(sample => sample.duplicateFetches)
    ),
    flickerEvents: medianNumber(samples.map(sample => sample.flickerEvents)),
    hydrationWarnings: medianNumber(
      samples.map(sample => sample.hydrationWarnings)
    ),
  };

  return {
    schema: SMOOTH_BASELINE_SCHEMA,
    surfaceId: surface.id,
    label: surface.label,
    platform,
    routeId: surface.routeId,
    resolvedPath,
    measuredAt: new Date().toISOString(),
    baseUrl,
    runs: samples.length,
    cpuThrottleRate,
    viewport: route.viewport ?? { width: 0, height: 0 },
    targets,
    median,
    flags: {
      clsPass: median.cls <= targets.cls,
      lcpPass: median.lcpMs <= targets.lcpMs,
      inpPass: median.inpMs == null || median.inpMs <= targets.inpMs,
      reloadPass: median.fullPageReloads <= targets.fullPageReloads,
      dupFetchPass: median.duplicateFetches <= targets.duplicateFetches,
      flickerPass: median.flickerEvents <= targets.flickerEvents,
      hydrationPass: median.hydrationWarnings <= targets.hydrationWarnings,
    },
    samples,
  };
}

export function scoreSurfaceFailure(baseline: SmoothSurfaceBaseline) {
  const targets = baseline.targets;
  const inp = baseline.median.inpMs ?? 0;
  return (
    Math.max(0, baseline.median.cls / targets.cls - 1) * 40 +
    Math.max(0, baseline.median.lcpMs / targets.lcpMs - 1) * 30 +
    Math.max(0, inp / targets.inpMs - 1) * 15 +
    baseline.median.fullPageReloads * 20 +
    baseline.median.duplicateFetches * 10 +
    baseline.median.flickerEvents * 25 +
    baseline.median.hydrationWarnings * 25
  );
}

export function pickWorstSurface(
  baselines: readonly SmoothSurfaceBaseline[]
): { surfaceId: SmoothSurfaceId; reason: string } | null {
  if (baselines.length === 0) return null;
  const ranked = [...baselines]
    .map(baseline => ({
      baseline,
      score: scoreSurfaceFailure(baseline),
    }))
    .sort((left, right) => right.score - left.score);
  const worst = ranked[0];
  const first = baselines[0];
  if (!worst || worst.score <= 0) {
    if (!first) return null;
    return {
      surfaceId: first.surfaceId,
      reason: 'all surfaces meet Smooth targets; start with homepage',
    };
  }
  const { baseline } = worst;
  const reasons: string[] = [];
  if (!baseline.flags.clsPass) {
    reasons.push(
      `CLS ${baseline.median.cls.toFixed(3)}>${baseline.targets.cls}`
    );
  }
  if (!baseline.flags.lcpPass) {
    reasons.push(
      `LCP ${Math.round(baseline.median.lcpMs)}ms>${baseline.targets.lcpMs}ms`
    );
  }
  if (!baseline.flags.inpPass) {
    reasons.push(
      `INP ${Math.round(baseline.median.inpMs ?? 0)}ms>${baseline.targets.inpMs}ms`
    );
  }
  if (!baseline.flags.flickerPass) {
    reasons.push(`flicker ${baseline.median.flickerEvents}`);
  }
  if (!baseline.flags.reloadPass) {
    reasons.push(`reloads ${baseline.median.fullPageReloads}`);
  }
  if (!baseline.flags.dupFetchPass) {
    reasons.push(`dup-fetches ${baseline.median.duplicateFetches}`);
  }
  if (!baseline.flags.hydrationPass) {
    reasons.push(`hydration ${baseline.median.hydrationWarnings}`);
  }
  return {
    surfaceId: baseline.surfaceId,
    reason: `${baseline.label} ${baseline.platform}: ${reasons.join(', ')}`,
  };
}

/** Checked-in baselines: medians/flags only (drop samples for PR size). */
export function toCheckedInBaseline(baseline: SmoothSurfaceBaseline) {
  const { samples: _samples, ...rest } = baseline;
  return rest;
}

export function writeSmoothBaselines(
  summary: SmoothBaselineSummary,
  outDir: string,
  options: {
    readonly previous?: readonly CheckedInSmoothBaseline[];
    readonly allowRaise?: boolean;
  } = {}
) {
  const next = summary.surfaces.map(baseline => toCheckedInBaseline(baseline));
  const raises = findBaselineRaises({
    previous: options.previous ?? [],
    next,
    allowRaise: options.allowRaise,
  });
  if (raises.length > 0) {
    throw new Error(
      `Smooth baseline write refused (shrink-only). Re-measure improvements with --write, or pass --allow-raise after an intentional re-baseline:\n- ${raises.join('\n- ')}`
    );
  }
  mkdirSync(outDir, { recursive: true });
  for (const baseline of next) {
    const path = resolve(
      outDir,
      smoothBaselineFileName(baseline.surfaceId, baseline.platform)
    );
    writeFileSync(path, `${JSON.stringify(baseline, null, 2)}\n`);
  }
  const summaryPath = resolve(outDir, 'summary.json');
  const compactSummary = {
    ...summary,
    surfaces: summary.surfaces.map(baseline => ({
      surfaceId: baseline.surfaceId,
      platform: baseline.platform,
      resolvedPath: baseline.resolvedPath,
      median: baseline.median,
      flags: baseline.flags,
    })),
  };
  writeFileSync(summaryPath, `${JSON.stringify(compactSummary, null, 2)}\n`);
  return summaryPath;
}

export function renderSmoothBaselineMarkdown(summary: SmoothBaselineSummary) {
  const lines: string[] = [
    '# Smooth baseline (median of 3)',
    '',
    `Measured at \`${summary.measuredAt}\` against \`${summary.baseUrl}\`.`,
    'Desktop 1512×944; mobile 390×844 with 4× CPU throttle. Isolated build only.',
    '',
    '| Surface | Platform | CLS | LCP (ms) | INP (ms) | Reloads | Dup fetches | Flicker | Hydration |',
    '|---|---|---:|---:|---:|---:|---:|---:|---:|',
  ];

  for (const baseline of summary.surfaces) {
    lines.push(
      `| ${baseline.label} | ${baseline.platform} | ${baseline.median.cls.toFixed(3)}${baseline.flags.clsPass ? '' : ' ❌'} | ${Math.round(baseline.median.lcpMs)}${baseline.flags.lcpPass ? '' : ' ❌'} | ${baseline.median.inpMs == null ? 'n/a' : Math.round(baseline.median.inpMs)}${baseline.flags.inpPass ? '' : ' ❌'} | ${baseline.median.fullPageReloads}${baseline.flags.reloadPass ? '' : ' ❌'} | ${baseline.median.duplicateFetches}${baseline.flags.dupFetchPass ? '' : ' ❌'} | ${baseline.median.flickerEvents}${baseline.flags.flickerPass ? '' : ' ❌'} | ${baseline.median.hydrationWarnings}${baseline.flags.hydrationPass ? '' : ' ❌'} |`
    );
  }

  lines.push(
    '',
    'Targets: CLS ≤ 0.02; LCP ≤ 2000ms desktop / ≤ 2500ms mobile; INP ≤ 150ms; 0 reloads; 0 duplicate fetches; 0 flicker; 0 hydration warnings.',
    ''
  );
  if (summary.worstSurfaceId) {
    lines.push(
      `**Worst surface for next fix PR:** \`${summary.worstSurfaceId}\` — ${summary.worstReason}`
    );
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}
