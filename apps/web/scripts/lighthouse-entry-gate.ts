/**
 * Throttled-mobile LCP gate for the artist golden-path entry routes.
 *
 * Why this exists: the Playwright budget guard measures unthrottled, warmed
 * Chromium, so it passed `/start` at 1.3s while Lighthouse mobile (simulated
 * slow 4G, 4x CPU) measured 8.4s on production, 2026-10-25. This gate runs
 * Lighthouse with the default mobile profile, takes the median of N runs and
 * fails when any route is over its budget. It replaces the unthrottled
 * `/start` budget; do not keep both.
 *
 * Warm-up policy: the exact staged deployment is seconds old when this gate
 * runs, so its very first loads pay serverless cold-start, edge-cache misses
 * and runner first-load stalls that a visitor on the live alias almost never
 * pays. One discarded Lighthouse load per route (default 1, `--warmups N`,
 * 0 disables) runs before the timed samples, mirroring
 * `discardSharedAliasContextWarmups` in performance-budgets-guard.ts: pay the
 * cold first-load once, then measure. Warm-up samples are logged but never
 * counted; only the timed samples can pass or fail a route.
 *
 * Budgets live in `performance-entry-budgets.json`. Ratchet `lcpMs` down when
 * the measured median is comfortably under it; never loosen it.
 */
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export interface EntryRouteBudget {
  readonly id: string;
  /** Path template; `[handle]` is replaced by `--handle`. */
  readonly path: string;
  readonly lcpMs: number;
  readonly cls: number;
}

export interface EntryRouteResult {
  readonly id: string;
  readonly url: string;
  readonly lcpSamples: readonly number[];
  readonly clsSamples: readonly number[];
}

export interface EntryRouteVerdict {
  readonly id: string;
  readonly url: string;
  readonly lcpMedianMs: number;
  readonly clsMedian: number;
  readonly lcpBudgetMs: number;
  readonly clsBudget: number;
  readonly pass: boolean;
  readonly failures: readonly string[];
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function resolveRoutePath(template: string, handle: string): string {
  return template.replaceAll('[handle]', encodeURIComponent(handle));
}

/** Pure verdict: a route with no samples fails closed. */
export function evaluateEntryRoute(
  budget: EntryRouteBudget,
  result: EntryRouteResult
): EntryRouteVerdict {
  const lcpMedianMs = median(result.lcpSamples);
  const clsMedian = median(result.clsSamples);
  const failures: string[] = [];
  if (!Number.isFinite(lcpMedianMs)) {
    failures.push('no LCP samples were collected');
  } else if (lcpMedianMs > budget.lcpMs) {
    failures.push(
      `LCP median ${Math.round(lcpMedianMs)}ms > ${budget.lcpMs}ms budget`
    );
  }
  if (!Number.isFinite(clsMedian)) {
    failures.push('no CLS samples were collected');
  } else if (clsMedian > budget.cls) {
    failures.push(`CLS median ${clsMedian.toFixed(3)} > ${budget.cls} budget`);
  }
  return {
    id: budget.id,
    url: result.url,
    lcpMedianMs,
    clsMedian,
    lcpBudgetMs: budget.lcpMs,
    clsBudget: budget.cls,
    pass: failures.length === 0,
    failures,
  };
}

export function parseBudgets(raw: unknown): EntryRouteBudget[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new TypeError('entry budgets must be a non-empty array');
  }
  return raw.map((item, index) => {
    const row = item as Partial<EntryRouteBudget>;
    if (
      typeof row.id !== 'string' ||
      typeof row.path !== 'string' ||
      !row.path.startsWith('/') ||
      typeof row.lcpMs !== 'number' ||
      !(row.lcpMs > 0) ||
      typeof row.cls !== 'number' ||
      !(row.cls >= 0)
    ) {
      throw new TypeError(`entry budget ${index} is malformed`);
    }
    return { id: row.id, path: row.path, lcpMs: row.lcpMs, cls: row.cls };
  });
}

function argValue(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

const LCP_ELEMENT_TAGS = new Set([
  'img',
  'image',
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'div',
  'span',
  'a',
  'button',
  'li',
  'label',
  'blockquote',
  'video',
  'svg',
  'canvas',
]);
const LCP_SUBPARTS = [
  'timeToFirstByte',
  'resourceLoadDelay',
  'resourceLoadDuration',
  'elementRenderDelay',
] as const;

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function items(value: unknown): readonly unknown[] {
  const result = record(value)?.items;
  return Array.isArray(result) ? result : [];
}

function lcpNode(audit: unknown): Record<string, unknown> | undefined {
  const details = items(record(audit)?.details);
  // LH13 lists the node directly beside the subparts table. Older reports
  // nest it under a table row. Never emit selectors, labels or HTML attributes.
  return (
    details.map(record).find(item => item?.type === 'node') ??
    details
      .flatMap(items)
      .map(item => record(record(item)?.node))
      .find(Boolean)
  );
}

function lcpElement(audit: unknown): { tag: string } {
  const node = lcpNode(audit);
  const snippet = node?.snippet;
  const tag =
    typeof snippet === 'string'
      ? /^<([a-z][a-z0-9]*)[\s/>]/i.exec(snippet.trimStart())?.[1].toLowerCase()
      : undefined;
  return { tag: tag && LCP_ELEMENT_TAGS.has(tag) ? tag : 'unknown' };
}

function nonnegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function lcpImagePresentation(audits: Record<string, unknown> | undefined) {
  const node = lcpNode(audits?.['lcp-breakdown-insight']);
  const rect = record(node?.boundingRect);
  const discovery = record(audits?.['lcp-discovery-insight']);
  const discoveryNode = lcpNode(discovery);
  const checklist = record(
    items(discovery?.details)
      .map(record)
      .find(item => item?.type === 'checklist')?.items
  );
  const imageDiscovery: Record<string, boolean> = {};
  if (
    typeof node?.lhId === 'string' &&
    node.lhId.length > 0 &&
    node.lhId === discoveryNode?.lhId
  ) {
    for (const key of [
      'priorityHinted',
      'requestDiscoverable',
      'eagerlyLoaded',
    ]) {
      const value = record(checklist?.[key])?.value;
      if (typeof value === 'boolean') imageDiscovery[key] = value;
    }
  }
  return {
    // TraceElements measures the resolved DOM node after tracing, not at LCP.
    ...(nonnegative(rect?.width) && nonnegative(rect?.height)
      ? { postTraceRectCssPx: { width: rect.width, height: rect.height } }
      : {}),
    ...(Object.keys(imageDiscovery).length ? { imageDiscovery } : {}),
  };
}

/** DOM tag only: even a div can be an image LCP via a CSS background. */
export function describeLcpElement(audit: unknown): string {
  const element = lcpElement(audit);
  return element.tag === 'unknown' ? 'unknown element' : element.tag;
}

function finalDestination(report: Record<string, unknown>) {
  for (const candidate of [report.finalDisplayedUrl, report.finalUrl]) {
    if (typeof candidate !== 'string') continue;
    try {
      const url = new URL(candidate);
      if (url.protocol === 'https:' || url.protocol === 'http:') {
        return { finalOrigin: url.origin, finalPath: url.pathname };
      }
    } catch {
      // Optional diagnostics must not change the measured budget verdict.
    }
  }
  return { finalOrigin: null, finalPath: null };
}

/**
 * A small allowlist survives in native job logs after temporary reports are
 * removed. Insight phases are observed trace milliseconds, NOT components of
 * the simulated Lighthouse LCP used by the unchanged budget verdict.
 */
export function extractLcpDiagnostics(value: unknown) {
  const report = record(value) ?? {};
  const audits = record(report.audits);
  const insight = record(audits?.['lcp-breakdown-insight']);
  const legacy = record(audits?.['largest-contentful-paint-element']);
  const rows = items(insight?.details)
    .filter(item => record(item)?.type === 'table')
    .flatMap(items);
  const observedLcpBreakdownMs: Partial<
    Record<(typeof LCP_SUBPARTS)[number], number>
  > = {};
  for (const subpart of LCP_SUBPARTS) {
    const row = rows.map(record).find(item => item?.subpart === subpart);
    const duration = row?.duration;
    if (
      typeof duration === 'number' &&
      Number.isFinite(duration) &&
      duration >= 0
    ) {
      observedLcpBreakdownMs[subpart] = duration;
    }
  }
  return {
    lighthouseVersion:
      typeof report.lighthouseVersion === 'string' &&
      /^\d{1,3}(?:\.\d{1,3}){1,3}$/.test(report.lighthouseVersion)
        ? report.lighthouseVersion
        : null,
    ...finalDestination(report),
    element: lcpElement(insight ?? legacy),
    ...lcpImagePresentation(audits),
    observedLcpBreakdownMs,
    diagnosticSource: insight
      ? 'lcp-breakdown-insight'
      : legacy
        ? 'legacy'
        : 'unavailable',
  };
}

const MAX_DIAGNOSTIC_ASSET_BYTES = 64 * 1024 * 1024;

function lighthouseModule(name: string): string {
  const require = createRequire(import.meta.url);
  const lhciDir = path.dirname(require.resolve('@lhci/cli/package.json'));
  return require.resolve(name, { paths: [lhciDir] });
}

function readDiagnosticAsset(filename: string) {
  let raw: string;
  try {
    if (statSync(filename).size > MAX_DIAGNOSTIC_ASSET_BYTES) {
      return { reason: 'asset-size' as const };
    }
    raw = readFileSync(filename, 'utf8');
  } catch {
    return { reason: 'asset-read' as const };
  }
  try {
    return { value: JSON.parse(raw) as unknown };
  } catch {
    return { reason: 'asset-json' as const };
  }
}

/** Private sequential CLI path: raw assets and library logging never escape. */
async function lcpResourceDiagnostics(outFile: string, report: unknown) {
  let stage: 'module-resolution' | 'matching-failed' | 'projection-failed' =
    'module-resolution';
  try {
    const prefix = outFile.replace(/\.\w{2,4}$/, '');
    const traceAsset = readDiagnosticAsset(`${prefix}-0.trace.json`);
    if (traceAsset.reason)
      return { status: 'unavailable' as const, reason: traceAsset.reason };
    const logAsset = readDiagnosticAsset(`${prefix}-0.devtoolslog.json`);
    if (logAsset.reason)
      return { status: 'unavailable' as const, reason: logAsset.reason };
    const trace = traceAsset.value;
    const devtoolsLog = logAsset.value;
    if (
      !Array.isArray(record(trace)?.traceEvents) ||
      !Array.isArray(devtoolsLog)
    )
      return { status: 'unavailable' as const, reason: 'asset-shape' };
    const computedPath = lighthouseModule(
      'lighthouse/core/computed/lcp-image-record.js'
    );
    const moduleUrl = pathToFileURL(computedPath).href;
    const { LCPImageRecord } = await import(moduleUrl);
    const { ProcessedNavigation } = await import(
      pathToFileURL(
        lighthouseModule('lighthouse/core/computed/processed-navigation.js')
      ).href
    );
    const loggerUrl = pathToFileURL(
      createRequire(computedPath).resolve('lighthouse-logger')
    ).href;
    const { default: logger } = await import(loggerUrl);
    stage = 'matching-failed';
    // The CLI's --quiet does not control this separate in-process API. Restore
    // this private logger sink even on rejection; do not change debug settings.
    const previousSink = logger._logToStdErr;
    let image: Record<string, unknown> | undefined;
    let lcpTimestamp: unknown;
    try {
      logger._logToStdErr = () => undefined;
      const context = { computedCache: new Map() };
      image = record(
        await LCPImageRecord.request({ trace, devtoolsLog }, context)
      );
      const navigation = await ProcessedNavigation.request(trace, context);
      lcpTimestamp = navigation.timestamps.largestContentfulPaint;
    } finally {
      // makeComputedArtifact's rejection-status logger uses a chained catch.
      // Drain that microtask before restoring the caller's sink.
      await Promise.resolve();
      logger._logToStdErr = previousSink;
    }
    if (!image || image.resourceType !== 'Image')
      return { status: 'unavailable' as const, reason: 'no-image-match' };
    // LH13's match compares request milliseconds to trace microseconds.
    // Reject an impossible late start without changing upstream selection.
    // Completion after paint remains valid (for example progressive images).
    if (!nonnegative(lcpTimestamp) || !nonnegative(image.networkRequestTime))
      return { status: 'unavailable' as const, reason: 'request-timing' };
    if (image.networkRequestTime > lcpTimestamp / 1000)
      return { status: 'unavailable' as const, reason: 'request-after-lcp' };
    stage = 'projection-failed';
    const measurements: Record<string, number | boolean | string> = {};
    for (const [source, target] of [
      ['transferSize', 'transferSizeBytes'],
      ['resourceSize', 'resourceSizeBytes'],
    ] as const) {
      if (nonnegative(image[source])) measurements[target] = image[source];
    }
    if (
      nonnegative(image.networkRequestTime) &&
      nonnegative(image.networkEndTime) &&
      image.networkEndTime >= image.networkRequestTime
    ) {
      measurements.requestDurationMs =
        image.networkEndTime - image.networkRequestTime;
    }
    if (
      typeof image.priority === 'string' &&
      ['VeryLow', 'Low', 'Medium', 'High', 'VeryHigh'].includes(image.priority)
    )
      measurements.priority = image.priority;
    if (
      typeof image.mimeType === 'string' &&
      [
        'image/avif',
        'image/webp',
        'image/png',
        'image/jpeg',
        'image/gif',
        'image/svg+xml',
      ].includes(image.mimeType)
    )
      measurements.mimeType = image.mimeType;
    const cacheFlags = [
      'fromDiskCache',
      'fromMemoryCache',
      'fromPrefetchCache',
    ] as const;
    if (typeof image.fetchedViaServiceWorker === 'boolean') {
      measurements.serviceWorker = image.fetchedViaServiceWorker;
    }
    const cache =
      image.fromDiskCache === true
        ? 'disk'
        : image.fromMemoryCache === true
          ? 'memory'
          : image.fromPrefetchCache === true
            ? 'prefetch'
            : cacheFlags.every(key => image[key] === false)
              ? 'none'
              : 'unknown';
    const origin = finalDestination(record(report) ?? {}).finalOrigin;
    if (typeof image.url === 'string' && origin) {
      const resource = new URL(image.url);
      if (['http:', 'https:'].includes(resource.protocol)) {
        measurements.sameOrigin = resource.origin === origin;
        measurements.sameOriginNextImage =
          resource.origin === origin && resource.pathname === '/_next/image';
      }
    }
    // Upstream correlates frame/node/paint size, follows redirects, and chooses
    // earliest completion if repeated requests remain. This is its heuristic,
    // not a claim of unique request identity or simulated LCP decomposition.
    return {
      status: 'matched' as const,
      method: 'lighthouse-lcp-image-record',
      resourceType: 'Image',
      cache,
      ...measurements,
    };
  } catch {
    // Optional evidence must not alter a valid LCP/CLS verdict or leak errors.
    return { status: 'unavailable' as const, reason: stage };
  }
}

async function runLighthouse(
  url: string,
  headersFile: string | null,
  outFile: string
): Promise<{
  lcp: number;
  cls: number;
  element: string;
  diagnostics: ReturnType<typeof extractLcpDiagnostics> & {
    lcpResource: Awaited<ReturnType<typeof lcpResourceDiagnostics>>;
  };
}> {
  const sampleDirectory = mkdtempSync(
    path.join(path.dirname(outFile), 'sample-')
  );
  try {
    const reportFile = path.join(sampleDirectory, path.basename(outFile));
    const cli = lighthouseModule('lighthouse/cli/index.js');
    const args = [
      cli,
      url,
      '--form-factor=mobile',
      '--only-categories=performance',
      '--output=json',
      `--output-path=${reportFile}`,
      '--save-assets',
      '--quiet',
      '--chrome-flags=--headless=new --no-sandbox --disable-dev-shm-usage',
    ];
    if (headersFile) args.push(`--extra-headers=${headersFile}`);
    let run: ReturnType<typeof spawnSync>;
    try {
      run = spawnSync(process.execPath, args, {
        // Browser/library errors may contain credential-bearing request URLs.
        stdio: 'ignore',
        timeout: 180_000,
      });
    } catch {
      throw new Error('lighthouse failed');
    }
    if (run.status !== 0) throw new Error('lighthouse failed');
    let report: unknown;
    try {
      report = JSON.parse(readFileSync(reportFile, 'utf8'));
    } catch {
      throw new Error('lighthouse report unavailable');
    }
    const audits = record(record(report)?.audits);
    const lcp = record(audits?.['largest-contentful-paint'])?.numericValue;
    const cls = record(audits?.['cumulative-layout-shift'])?.numericValue;
    if (typeof lcp !== 'number' || typeof cls !== 'number') {
      throw new Error('lighthouse produced no LCP/CLS');
    }
    return {
      lcp,
      cls,
      element: describeLcpElement(
        audits?.['lcp-breakdown-insight'] ??
          audits?.['largest-contentful-paint-element']
      ),
      diagnostics: {
        ...extractLcpDiagnostics(report),
        lcpResource: await lcpResourceDiagnostics(reportFile, report),
      },
    };
  } finally {
    rmSync(sampleDirectory, { recursive: true, force: true });
  }
}

function warmupOutputPath(
  work: string,
  budgetId: string,
  warmup: number
): string {
  return path.join(work, `${budgetId}-warmup-${warmup}.json`);
}

/**
 * A discarded Lighthouse load: pays the fresh deployment's cold-start before
 * the timed samples. Its result is logged for diagnosis and never counted —
 * only a timed sample can pass or fail a route. A warm-up that fails is
 * tolerated: if the origin is truly broken the timed runs still fail closed.
 */
async function tryWarmupLoad(
  url: string,
  headersFile: string | null,
  outFile: string
): Promise<{ lcp: number; cls: number } | null> {
  try {
    return await runLighthouse(url, headersFile, outFile);
  } catch (error) {
    console.log(
      `  warmup load failed and was discarded: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return null;
  }
}

export async function main(argv: readonly string[]): Promise<number> {
  const baseUrl = argValue(argv, '--base-url');
  if (!baseUrl) throw new Error('--base-url is required');
  const handle = argValue(argv, '--handle') ?? 'tim';
  const runs = Number(argValue(argv, '--runs') ?? '3');
  const warmups = Number(argValue(argv, '--warmups') ?? '1');
  if (!Number.isInteger(warmups) || warmups < 0) {
    throw new Error('--warmups must be a non-negative integer');
  }
  const only = argv.flatMap((value, index) =>
    value === '--route-id' ? [argv[index + 1]] : []
  );
  const here = path.dirname(fileURLToPath(import.meta.url));
  const budgets = parseBudgets(
    JSON.parse(
      readFileSync(path.join(here, '..', 'performance-entry-budgets.json'), {
        encoding: 'utf8',
      })
    )
  ).filter(budget => only.length === 0 || only.includes(budget.id));
  if (budgets.length === 0) throw new Error('no entry routes selected');

  const work = mkdtempSync(path.join(tmpdir(), 'entry-lh-'));
  let headersFile: string | null = null;
  const verdicts: EntryRouteVerdict[] = [];
  try {
    const bypass = process.env.PLAYWRIGHT_VERCEL_BYPASS_SECRET;
    if (bypass) {
      headersFile = path.join(work, 'headers.json');
      try {
        writeFileSync(
          headersFile,
          JSON.stringify({
            'x-vercel-protection-bypass': bypass,
            'x-vercel-set-bypass-cookie': 'true',
          }),
          { mode: 0o600 }
        );
      } catch {
        throw new Error('lighthouse headers unavailable');
      }
    }
    for (const budget of budgets) {
      const url = new URL(
        resolveRoutePath(budget.path, handle),
        baseUrl
      ).toString();
      const lcpSamples: number[] = [];
      const clsSamples: number[] = [];
      for (let warmup = 0; warmup < warmups; warmup += 1) {
        const discarded = await tryWarmupLoad(
          url,
          headersFile,
          warmupOutputPath(work, budget.id, warmup)
        );
        console.log(
          `  ${budget.id} warmup ${warmup + 1}/${warmups}: discarded` +
            (discarded
              ? ` (LCP ${Math.round(discarded.lcp)}ms CLS ${discarded.cls.toFixed(3)})`
              : '')
        );
      }
      for (let run = 0; run < runs; run++) {
        const sample = await runLighthouse(
          url,
          headersFile,
          path.join(work, `${budget.id}-${run}.json`)
        );
        lcpSamples.push(sample.lcp);
        clsSamples.push(sample.cls);
        console.log(
          `  ${budget.id} sample ${run + 1}/${runs}: LCP ${Math.round(sample.lcp)}ms CLS ${sample.cls.toFixed(3)} element ${sample.element}`
        );
        console.log(
          `  ${budget.id} diagnostics ${JSON.stringify(sample.diagnostics)}`
        );
      }
      verdicts.push(
        evaluateEntryRoute(budget, {
          id: budget.id,
          url,
          lcpSamples,
          clsSamples,
        })
      );
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  for (const verdict of verdicts) {
    console.log(
      `${verdict.pass ? 'PASS' : 'FAIL'} ${verdict.id}: LCP ${Math.round(verdict.lcpMedianMs)}ms / ${verdict.lcpBudgetMs}ms, CLS ${verdict.clsMedian.toFixed(3)} / ${verdict.clsBudget}`
    );
    for (const failure of verdict.failures) console.log(`  ${failure}`);
  }
  return verdicts.every(verdict => verdict.pass) ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    code => process.exit(code),
    error => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(2);
    }
  );
}
