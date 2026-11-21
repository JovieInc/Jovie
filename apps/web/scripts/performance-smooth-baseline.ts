#!/usr/bin/env tsx
/**
 * Smooth phase-1 baseline runner.
 *
 * Extends the existing performance-budgets-guard controller: same auth bootstrap,
 * route resolvers, CWV init script, and ready-selector waits. Adds Smooth
 * viewports (1512×944 / 390×844), mobile 4× CPU throttle, INP, reload /
 * duplicate-fetch / flicker / hydration probes, and checked-in baseline JSON.
 *
 *   pnpm --filter @jovie/web run perf:smooth:baseline
 *   pnpm --filter @jovie/web exec tsx scripts/performance-smooth-baseline.ts --write
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type Browser,
  type BrowserContext,
  type CDPSession,
  type ConsoleMessage,
  chromium,
  type Page,
  type Request as PlaywrightRequest,
} from '@playwright/test';
import {
  collectBrowserMetrics,
  createContextOptions,
  loadAuthCookies,
  loadPerformanceProtectedOriginCookies,
  PERF_INIT_SCRIPT,
  type PerformanceContextCookie,
  waitForAnyVisible,
} from './performance-budgets-guard';
import {
  assertResolvedPerfRoutePath,
  getRouteTimingBudgets,
  type PerfRouteDefinition,
  type PerfTimingMetricName,
} from './performance-route-manifest';
import {
  buildSmoothRouteDefinition,
  SMOOTH_MOBILE_CPU_RATE,
  SMOOTH_RUNS,
  SMOOTH_SURFACES,
  type SmoothPlatform,
  type SmoothSurfaceDefinition,
  type SmoothSurfaceId,
  smoothBaselineFileName,
  smoothTargetsFor,
} from './performance-smooth-manifest';
import {
  emptySmoothProbeSnapshot,
  isHydrationConsoleText,
  medianNullable,
  medianNumber,
  SMOOTH_PROBE_INIT_SCRIPT,
  type SmoothProbeSnapshot,
} from './performance-smooth-probes';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(scriptDir, '..');
const repoRoot = resolve(webRoot, '..', '..');
const DEFAULT_BASELINE_DIR = resolve(
  repoRoot,
  'docs/performance/smooth/baselines'
);
const DEFAULT_BASE_URL =
  process.env.BASE_URL?.trim() || 'http://localhost:3000';
const NAVIGATION_TIMEOUT_MS = 60_000;
const SETTLE_MS = 1_500;

export const SMOOTH_BASELINE_SCHEMA = 'jovie-smooth-baseline/v1' as const;

export interface SmoothRunSample {
  readonly attempt: number;
  readonly cls: number;
  readonly lcpMs: number;
  readonly inpMs: number | null;
  readonly fcpMs: number;
  readonly ttfbMs: number;
  readonly fullPageReloads: number;
  readonly duplicateFetches: number;
  readonly flickerEvents: number;
  readonly hydrationWarnings: number;
  readonly flickerReasons: readonly string[];
  readonly hydrationMessages: readonly string[];
  readonly finalUrl: string;
}

export interface SmoothSurfaceBaseline {
  readonly schema: typeof SMOOTH_BASELINE_SCHEMA;
  readonly surfaceId: SmoothSurfaceId;
  readonly label: string;
  readonly platform: SmoothPlatform;
  readonly routeId: string;
  readonly resolvedPath: string;
  readonly measuredAt: string;
  readonly baseUrl: string;
  readonly runs: number;
  readonly cpuThrottleRate: number;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly targets: ReturnType<typeof smoothTargetsFor>;
  readonly median: {
    readonly cls: number;
    readonly lcpMs: number;
    readonly inpMs: number | null;
    readonly fcpMs: number;
    readonly ttfbMs: number;
    readonly fullPageReloads: number;
    readonly duplicateFetches: number;
    readonly flickerEvents: number;
    readonly hydrationWarnings: number;
  };
  readonly flags: {
    readonly clsPass: boolean;
    readonly lcpPass: boolean;
    readonly inpPass: boolean;
    readonly reloadPass: boolean;
    readonly dupFetchPass: boolean;
    readonly flickerPass: boolean;
    readonly hydrationPass: boolean;
  };
  readonly samples: readonly SmoothRunSample[];
}

export interface SmoothBaselineSummary {
  readonly schema: 'jovie-smooth-baseline-summary/v1';
  readonly measuredAt: string;
  readonly baseUrl: string;
  readonly runsPerCell: number;
  readonly surfaces: readonly SmoothSurfaceBaseline[];
  readonly worstSurfaceId: SmoothSurfaceId | null;
  readonly worstReason: string | null;
}

interface CliOptions {
  readonly authPath?: string;
  readonly baseUrl: string;
  readonly outDir: string;
  readonly platforms: readonly SmoothPlatform[];
  readonly runs: number;
  readonly surfaceIds: readonly SmoothSurfaceId[];
  readonly write: boolean;
  readonly json: boolean;
}

function parsePositiveOddInteger(value: string | undefined, label: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed % 2 === 0) {
    throw new TypeError(`Expected a positive odd integer for ${label}`);
  }
  return parsed;
}

export function parseSmoothBaselineCliArgs(
  args: readonly string[],
  defaults: Partial<CliOptions> = {}
): CliOptions {
  let authPath = defaults.authPath;
  let baseUrl = defaults.baseUrl ?? DEFAULT_BASE_URL;
  let outDir = defaults.outDir ?? DEFAULT_BASELINE_DIR;
  let runs = defaults.runs ?? SMOOTH_RUNS;
  let write = defaults.write ?? false;
  let json = defaults.json ?? false;
  const platforms = new Set<SmoothPlatform>(
    defaults.platforms ?? ['desktop', 'mobile']
  );
  const surfaceIds = new Set<SmoothSurfaceId>(
    defaults.surfaceIds ?? SMOOTH_SURFACES.map(surface => surface.id)
  );

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--write') {
      write = true;
      continue;
    }
    if (arg === '--json') {
      json = true;
      continue;
    }
    if (arg === '--base-url') {
      const value = args[index + 1];
      if (!value) throw new TypeError('Missing value for --base-url');
      baseUrl = value;
      index += 1;
      continue;
    }
    if (arg === '--auth-path') {
      const value = args[index + 1];
      if (!value) throw new TypeError('Missing value for --auth-path');
      authPath = value;
      index += 1;
      continue;
    }
    if (arg === '--out-dir') {
      const value = args[index + 1];
      if (!value) throw new TypeError('Missing value for --out-dir');
      outDir = value;
      index += 1;
      continue;
    }
    if (arg === '--runs') {
      runs = parsePositiveOddInteger(args[index + 1], '--runs');
      index += 1;
      continue;
    }
    if (arg === '--platform') {
      const value = args[index + 1];
      if (value !== 'desktop' && value !== 'mobile') {
        throw new TypeError('--platform must be desktop or mobile');
      }
      platforms.clear();
      platforms.add(value);
      index += 1;
      continue;
    }
    if (arg === '--surface') {
      const value = args[index + 1] as SmoothSurfaceId | undefined;
      if (!value || !SMOOTH_SURFACES.some(surface => surface.id === value)) {
        throw new TypeError(`Unknown --surface ${value}`);
      }
      if (!defaults.surfaceIds) surfaceIds.clear();
      surfaceIds.add(value);
      index += 1;
      continue;
    }
    throw new TypeError(`Unknown argument: ${arg}`);
  }

  return {
    authPath,
    baseUrl,
    outDir: isAbsolute(outDir) ? outDir : resolve(repoRoot, outDir),
    platforms: [...platforms],
    runs,
    surfaceIds: [...surfaceIds],
    write,
    json,
  };
}

function resolveRouteUrl(baseUrl: string, path: string) {
  return new URL(path, `${baseUrl.replace(/\/$/, '')}/`).toString();
}

async function resolvePathForRoute(
  route: PerfRouteDefinition,
  baseUrl: string,
  authCookies: ReturnType<typeof loadAuthCookies>
) {
  if (!route.resolvePath) return route.path;
  return route.resolvePath(route, { authCookies, baseUrl });
}

async function applyCpuThrottle(page: Page, rate: number) {
  if (rate <= 1) return;
  const client: CDPSession = await page.context().newCDPSession(page);
  await client.send('Emulation.setCPUThrottlingRate', { rate });
}

function attachRequestTrackers(page: Page) {
  const documentUrls: string[] = [];
  const onRequest = (request: PlaywrightRequest) => {
    if (request.resourceType() === 'document') {
      documentUrls.push(request.url());
    }
  };
  page.on('request', onRequest);
  return {
    documentUrls,
    dispose() {
      page.off('request', onRequest);
    },
  };
}

function attachConsoleTrackers(page: Page) {
  const hydrationMessages: string[] = [];
  const onConsole = (message: ConsoleMessage) => {
    const text = message.text();
    if (isHydrationConsoleText(text)) {
      hydrationMessages.push(text);
    }
  };
  const onPageError = (error: Error) => {
    const text = String(error);
    if (isHydrationConsoleText(text)) {
      hydrationMessages.push(text);
    }
  };
  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  return {
    hydrationMessages,
    dispose() {
      page.off('console', onConsole);
      page.off('pageerror', onPageError);
    },
  };
}

async function readSmoothProbe(page: Page): Promise<SmoothProbeSnapshot> {
  return page.evaluate(() => {
    const probe = (
      window as Window & {
        __smoothProbe?: {
          documentRequests?: number;
          duplicateFetches?: number;
          flickerEvents?: number;
          flickerReasons?: string[];
          hydrationMessages?: string[];
          inpMs?: number | null;
        };
      }
    ).__smoothProbe;
    if (!probe) {
      return {
        inpMs: null,
        fullPageReloads: 0,
        duplicateFetches: 0,
        hydrationWarnings: 0,
        flickerEvents: 0,
        flickerReasons: [],
        hydrationMessages: [],
      };
    }
    return {
      inpMs: typeof probe.inpMs === 'number' ? probe.inpMs : null,
      fullPageReloads: probe.documentRequests ?? 0,
      duplicateFetches: probe.duplicateFetches ?? 0,
      hydrationWarnings: 0,
      flickerEvents: probe.flickerEvents ?? 0,
      flickerReasons: probe.flickerReasons ?? [],
      hydrationMessages: probe.hydrationMessages ?? [],
    };
  });
}

async function triggerMainInteraction(
  page: Page,
  surface: SmoothSurfaceDefinition
) {
  const selector = surface.interactionSelector;
  if (!selector) return;
  const first = selector.split(',')[0]?.trim();
  if (!first) return;
  const locator = page.locator(first).first();
  if ((await locator.count()) === 0) return;
  if (!(await locator.isVisible().catch(() => false))) return;
  await locator.click({ timeout: 5_000 }).catch(() => undefined);
  await page.waitForTimeout(250);
}

export async function measureSmoothSample(options: {
  readonly browser: Browser;
  readonly route: PerfRouteDefinition;
  readonly surface: SmoothSurfaceDefinition;
  readonly platform: SmoothPlatform;
  readonly baseUrl: string;
  readonly resolvedPath: string;
  readonly authCookies: ReturnType<typeof loadAuthCookies>;
  readonly protectedOriginCookies: readonly PerformanceContextCookie[];
  readonly attempt: number;
  readonly cpuThrottleRate: number;
}): Promise<SmoothRunSample> {
  const {
    browser,
    route,
    surface,
    baseUrl,
    resolvedPath,
    authCookies,
    protectedOriginCookies,
    attempt,
    cpuThrottleRate,
  } = options;

  const contextOptions = createContextOptions(
    route,
    authCookies,
    protectedOriginCookies
  );
  const context: BrowserContext = await browser.newContext(contextOptions);
  const page = await context.newPage();
  const requestTracker = attachRequestTrackers(page);
  const consoleTracker = attachConsoleTrackers(page);

  try {
    await page.addInitScript(PERF_INIT_SCRIPT);
    await page.addInitScript(SMOOTH_PROBE_INIT_SCRIPT);
    await applyCpuThrottle(page, cpuThrottleRate);

    const url = resolveRouteUrl(baseUrl, resolvedPath);
    await page.goto(url, {
      timeout: NAVIGATION_TIMEOUT_MS,
      waitUntil: 'domcontentloaded',
    });

    if (route.readySelectors.content?.length) {
      await waitForAnyVisible(page, route.readySelectors.content);
    }

    await page.waitForTimeout(SETTLE_MS);
    await triggerMainInteraction(page, surface);
    await page.waitForTimeout(400);

    const requiredMetrics = getRouteTimingBudgets(route).map(
      budget => budget.metric
    ) as PerfTimingMetricName[];
    const browserMetrics = await collectBrowserMetrics(
      page,
      false,
      requiredMetrics
    );
    const probe = await readSmoothProbe(page);
    const documentReloads = Math.max(0, requestTracker.documentUrls.length - 1);

    return {
      attempt,
      cls: browserMetrics.timingValues['cumulative-layout-shift'],
      lcpMs: browserMetrics.timingValues['largest-contentful-paint'],
      inpMs: probe.inpMs ?? browserMetrics.timingValues['first-input-delay'],
      fcpMs: browserMetrics.timingValues['first-contentful-paint'],
      ttfbMs: browserMetrics.timingValues['time-to-first-byte'],
      fullPageReloads: Math.max(documentReloads, probe.fullPageReloads),
      duplicateFetches: probe.duplicateFetches,
      flickerEvents: probe.flickerEvents,
      hydrationWarnings: consoleTracker.hydrationMessages.length,
      flickerReasons: probe.flickerReasons,
      hydrationMessages: consoleTracker.hydrationMessages,
      finalUrl: browserMetrics.finalUrl,
    };
  } finally {
    requestTracker.dispose();
    consoleTracker.dispose();
    await context.close();
  }
}

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
  const overshoot =
    Math.max(0, baseline.median.cls / targets.cls - 1) * 40 +
    Math.max(0, baseline.median.lcpMs / targets.lcpMs - 1) * 30 +
    Math.max(0, inp / targets.inpMs - 1) * 15 +
    baseline.median.fullPageReloads * 20 +
    baseline.median.duplicateFetches * 10 +
    baseline.median.flickerEvents * 25 +
    baseline.median.hydrationWarnings * 25;
  return overshoot;
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
  if (!worst || worst.score <= 0) {
    return {
      surfaceId: baselines[0]!.surfaceId,
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

export async function runSmoothBaseline(
  options: CliOptions
): Promise<SmoothBaselineSummary> {
  const surfaces = SMOOTH_SURFACES.filter(surface =>
    options.surfaceIds.includes(surface.id)
  );
  const browser = await chromium.launch();
  const baselines: SmoothSurfaceBaseline[] = [];

  try {
    const authCookies = loadAuthCookies(options.baseUrl, options.authPath);
    const protectedOriginCookies = await loadPerformanceProtectedOriginCookies(
      browser,
      options.baseUrl
    );

    for (const platform of options.platforms) {
      for (const surface of surfaces) {
        const route = buildSmoothRouteDefinition(surface, platform);
        if (route.requiresAuth && authCookies.length === 0) {
          throw new Error(
            `Smooth surface ${surface.id} requires auth. Run perf:auth first or pass --auth-path.`
          );
        }
        const resolvedPath = await resolvePathForRoute(
          route,
          options.baseUrl,
          authCookies
        );
        assertResolvedPerfRoutePath(route, resolvedPath);

        const cpuThrottleRate =
          platform === 'mobile' ? SMOOTH_MOBILE_CPU_RATE : 1;
        console.error(
          `[smooth] ${surface.id}/${platform} -> ${resolvedPath} (${options.runs} runs, cpu=${cpuThrottleRate}x)`
        );

        const samples: SmoothRunSample[] = [];
        for (let attempt = 1; attempt <= options.runs; attempt += 1) {
          const sample = await measureSmoothSample({
            browser,
            route,
            surface,
            platform,
            baseUrl: options.baseUrl,
            resolvedPath,
            authCookies,
            protectedOriginCookies,
            attempt,
            cpuThrottleRate,
          });
          samples.push(sample);
          console.error(
            `  sample ${attempt}/${options.runs}: LCP=${Math.round(sample.lcpMs)}ms CLS=${sample.cls.toFixed(3)} INP=${sample.inpMs == null ? 'n/a' : `${Math.round(sample.inpMs)}ms`} flicker=${sample.flickerEvents} dups=${sample.duplicateFetches}`
          );
        }

        baselines.push(
          buildSurfaceBaseline({
            surface,
            platform,
            route,
            resolvedPath,
            baseUrl: options.baseUrl,
            samples,
            cpuThrottleRate,
          })
        );
      }
    }
  } finally {
    await browser.close();
  }

  const worst = pickWorstSurface(baselines);
  return {
    schema: 'jovie-smooth-baseline-summary/v1',
    measuredAt: new Date().toISOString(),
    baseUrl: options.baseUrl,
    runsPerCell: options.runs,
    surfaces: baselines,
    worstSurfaceId: worst?.surfaceId ?? null,
    worstReason: worst?.reason ?? null,
  };
}

export function writeSmoothBaselines(
  summary: SmoothBaselineSummary,
  outDir: string
) {
  mkdirSync(outDir, { recursive: true });
  for (const baseline of summary.surfaces) {
    const path = resolve(
      outDir,
      smoothBaselineFileName(baseline.surfaceId, baseline.platform)
    );
    writeFileSync(path, `${JSON.stringify(baseline, null, 2)}\n`);
  }
  const summaryPath = resolve(outDir, 'summary.json');
  writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
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

// Keep emptySmoothProbeSnapshot referenced for tests / future dry runs.
void emptySmoothProbeSnapshot;

async function main() {
  const options = parseSmoothBaselineCliArgs(process.argv.slice(2));
  const summary = await runSmoothBaseline(options);
  if (options.write) {
    const summaryPath = writeSmoothBaselines(summary, options.outDir);
    console.error(`[smooth] wrote baselines to ${summaryPath}`);
  }
  if (options.json) {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } else {
    process.stdout.write(renderSmoothBaselineMarkdown(summary));
  }
}

const isEntrypoint =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntrypoint) {
  main().catch(error => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  });
}
