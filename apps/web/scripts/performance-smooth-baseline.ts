#!/usr/bin/env tsx
/** Smooth baseline runner — extends performance-budgets-guard (not a second controller). */
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import {
  loadAuthCookies,
  loadPerformanceProtectedOriginCookies,
} from './performance-budgets-guard';
import { assertResolvedPerfRoutePath } from './performance-route-manifest';
import {
  buildSmoothRouteDefinition,
  SMOOTH_MOBILE_CPU_RATE,
  SMOOTH_RUNS,
  SMOOTH_SURFACES,
  type SmoothPlatform,
  type SmoothSurfaceId,
} from './performance-smooth-manifest';
import {
  measureSmoothSample,
  resolvePathForRoute,
} from './performance-smooth-measure';
import {
  buildSurfaceBaseline,
  pickWorstSurface,
  renderSmoothBaselineMarkdown,
  writeSmoothBaselines,
} from './performance-smooth-report';
import type {
  SmoothBaselineSummary,
  SmoothRunSample,
  SmoothSurfaceBaseline,
} from './performance-smooth-types';

export { measureSmoothSample } from './performance-smooth-measure';
export {
  buildSurfaceBaseline,
  pickWorstSurface,
  renderSmoothBaselineMarkdown,
  scoreSurfaceFailure,
  writeSmoothBaselines,
} from './performance-smooth-report';
export type {
  SmoothBaselineSummary,
  SmoothRunSample,
  SmoothSurfaceBaseline,
} from './performance-smooth-types';
export { SMOOTH_BASELINE_SCHEMA } from './performance-smooth-types';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(scriptDir, '..');
const repoRoot = resolve(webRoot, '..', '..');
const DEFAULT_BASELINE_DIR = resolve(
  repoRoot,
  'docs/performance/smooth/baselines'
);
const DEFAULT_BASE_URL =
  process.env.BASE_URL?.trim() || 'http://localhost:3000';

interface CliOptions {
  readonly authPath?: string;
  readonly baseUrl: string;
  /** Optional Vercel share URL (`?_vercel_share=`) when automation bypass is unavailable. */
  readonly shareUrl?: string;
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
  let shareUrl = defaults.shareUrl;
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
    if (arg === '--share-url') {
      const value = args[index + 1];
      if (!value) throw new TypeError('Missing value for --share-url');
      shareUrl = value;
      baseUrl = new URL(value).origin;
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
    shareUrl,
    outDir: isAbsolute(outDir) ? outDir : resolve(repoRoot, outDir),
    platforms: [...platforms],
    runs,
    surfaceIds: [...surfaceIds],
    write,
    json,
  };
}

async function bootstrapShareOriginCookies(
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  shareUrl: string,
  baseUrl: string
) {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.goto(shareUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    const cookies = await context.cookies(baseUrl);
    if (!cookies.some(cookie => cookie.name === '_vercel_jwt')) {
      throw new Error(
        'Share URL bootstrap did not produce a `_vercel_jwt` cookie.'
      );
    }
    return cookies.map(cookie => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path,
      expires: cookie.expires,
      httpOnly: cookie.httpOnly,
      secure: cookie.secure,
      sameSite: cookie.sameSite as 'Lax' | 'None' | 'Strict',
    }));
  } finally {
    await context.close();
  }
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
    const protectedOriginCookies = options.shareUrl
      ? await bootstrapShareOriginCookies(
          browser,
          options.shareUrl,
          options.baseUrl
        )
      : await loadPerformanceProtectedOriginCookies(browser, options.baseUrl);

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
