#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import {
  blockingCaptureRuntimeFailures,
  buildCaptureArtifactPaths,
  CRITICAL_JOURNEY_CAPTURE_SCHEMA,
  MAX_CAPTURE_WORKERS,
  resolveCaptureJourneyId,
  resolveCaptureWorkerCount,
  runCapturePool,
  sanitizeCaptureText,
  summarizeScriptedCaptures,
  validateCaptureManifest,
} from './pr-visual-review.mjs';

const baseUrl = process.env.BASE_URL ?? 'http://127.0.0.1:3100';
const routes = JSON.parse(process.env.PR_VISUAL_ROUTES ?? '[]');
const outDir = process.env.PR_VISUAL_OUT ?? 'pr-visual-artifacts';
const isExactSha = value =>
  typeof value === 'string' && /^[0-9a-f]{40}$/i.test(value);
const exactHead = (() => {
  if (isExactSha(process.env.PR_VISUAL_HEAD_SHA)) {
    return process.env.PR_VISUAL_HEAD_SHA;
  }

  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (eventPath) {
    try {
      const event = JSON.parse(readFileSync(eventPath, 'utf8'));
      const pullRequestHead = event?.pull_request?.head?.sha;
      if (isExactSha(pullRequestHead)) return pullRequestHead;
    } catch {
      // Fall through to the runner SHA when the event payload is unavailable.
    }
  }

  return isExactSha(process.env.GITHUB_SHA) ? process.env.GITHUB_SHA : null;
})();
const viewports = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
};
const AUTHENTICATED_SHELL_WAIT_MS = 30_000;
const NEW_CHAT_EMPTY_WAIT_MS = 15_000;
const CAPTURE_TIMEOUT_MS = 45_000;
const CIRCUIT_BREAKER_FAILURES = 2;
if (!Array.isArray(routes) || routes.length === 0)
  throw new Error('No routes supplied');
if (!exactHead)
  throw new Error('Critical-journey capture requires an exact source SHA');

/**
 * Next production streaming can paint the app-shell Suspense fallback
 * (unlabeled skeleton + aria-hidden greeting region) before
 * DashboardShellContent resolves. Capture must wait for the live
 * authenticated chrome, not the first HTML chunk. JOV-5387 New Chat evidence
 * also requires the loaded empty-state greeting, which is not aria-hidden.
 */
async function waitForAuthenticatedShell(page, route) {
  if (!route.startsWith('/app/')) return;

  // A second dashboard-header can stay hidden in the DOM; wait until any
  // match is visible so Playwright strict mode cannot fail closed.
  const visibleShellChrome = page
    .locator(
      '[data-testid="dashboard-header"], [data-testid="dashboard-error"]'
    )
    .filter({ visible: true });
  await visibleShellChrome.first().waitFor({
    state: 'visible',
    timeout: AUTHENTICATED_SHELL_WAIT_MS,
  });
  if (
    (await page
      .getByTestId('dashboard-error')
      .filter({ visible: true })
      .count()) > 0
  ) {
    throw new Error(
      'Captured app route rendered dashboard error UI instead of authenticated shell'
    );
  }

  const shellMarker = page
    .getByRole('heading', { name: 'New Chat', level: 1 })
    .or(page.getByRole('link', { name: 'New Chat' }))
    .or(page.getByRole('link', { name: 'Inbox' }))
    .or(page.getByRole('link', { name: 'Library' }));

  await shellMarker.filter({ visible: true }).first().waitFor({
    state: 'visible',
    timeout: AUTHENTICATED_SHELL_WAIT_MS,
  });

  if (route === '/app/chat' || route.startsWith('/app/chat/')) {
    // JOV-7150: the loaded empty state is one greeting sentence rendered as
    // chat-empty-state-greeting-text. The loading still-frame only renders an
    // aria-hidden skeleton inside chat-empty-state-greeting-region, so the
    // -text testid is unique to the loaded state.
    await page
      .getByRole('heading', { name: /Good (morning|afternoon|evening)/ })
      .and(page.getByTestId('chat-empty-state-greeting-text'))
      .filter({ visible: true })
      .first()
      .waitFor({
        state: 'visible',
        timeout: NEW_CHAT_EMPTY_WAIT_MS,
      });
  }
}

function sanitizeRuntimeFailures(failures) {
  return failures.map(failure => ({
    ...failure,
    ...(failure.message
      ? { message: sanitizeCaptureText(failure.message) }
      : {}),
    ...(failure.url
      ? {
          url: (() => {
            try {
              const parsed = new URL(failure.url);
              return `${parsed.origin}${parsed.pathname}`;
            } catch {
              return '[invalid-url]';
            }
          })(),
        }
      : {}),
  }));
}

await mkdir(outDir, { recursive: true });
const workers = resolveCaptureWorkerCount(process.env.PR_VISUAL_WORKERS);
const browser = await chromium.launch({ headless: true });
const browserVersion = browser.version();
const targets = routes.flatMap(route =>
  Object.entries(viewports).map(([viewportName, viewport]) => ({
    route,
    viewportName,
    viewport,
  }))
);
let failureCount = 0;
let captures;
try {
  captures = await runCapturePool(targets, workers, async (target, index) => {
    const { route, viewportName, viewport } = target;
    const sessionId = `context-${String(index + 1).padStart(2, '0')}`;
    const { artifactPath, outputPath } = buildCaptureArtifactPaths({
      outDir,
      route,
      viewportName,
    });
    const tracePath = artifactPath.replace(/\.png$/, '.trace.zip');
    const journeyId = resolveCaptureJourneyId(route);
    const actions = [];
    const runtimeFailures = [];
    const observed = {
      finalUrl: '',
      title: '',
      statusCode: null,
      text: '',
      runtimeFailures,
    };
    const result = {
      route,
      journeyId,
      viewport: viewportName,
      path: artifactPath,
      status: 'blocked',
      lane: 'scripted',
      sessionId,
      assertion: {
        id: `route-render:${journeyId ?? artifactPath.replace(/\.png$/, '')}`,
        preserved: true,
        expectedOutcome:
          'Requested route renders its intended state without a redirect, error shell, or blocking runtime failure.',
      },
      actions,
      observed,
      evidence: { screenshot: artifactPath, trace: null },
    };

    if (failureCount >= CIRCUIT_BREAKER_FAILURES) {
      result.error = `Circuit breaker opened after ${failureCount} scripted capture failures.`;
      return result;
    }

    let context = null;
    let page = null;
    let tracingStarted = false;
    let failureRecorded = false;
    try {
      context = await browser.newContext({
        viewport,
        colorScheme: 'dark',
        deviceScaleFactor: 1,
      });
      actions.push('create-isolated-browser-context');
      await context.tracing.start({
        screenshots: true,
        snapshots: true,
        sources: false,
      });
      tracingStarted = true;
      page = await context.newPage();
      page.on('console', message => {
        if (message.type() === 'error')
          runtimeFailures.push({
            type: 'console-error',
            message: message.text(),
          });
      });
      page.on('pageerror', error =>
        runtimeFailures.push({ type: 'page-error', message: error.message })
      );
      page.on('response', response => {
        if (response.status() >= 500)
          runtimeFailures.push({
            type: 'http-5xx',
            status: response.status(),
            url: response.url(),
          });
      });
      const url = new URL(route, baseUrl).toString();
      if (route.startsWith('/app/')) {
        actions.push('bootstrap-creator-ready-session');
        const authEntryUrl = new URL(
          `/api/dev/test-auth/enter?persona=creator-ready&redirect=${encodeURIComponent(route)}`,
          baseUrl
        );
        const authResponse = await context.request.get(
          authEntryUrl.toString(),
          { maxRedirects: 0, timeout: CAPTURE_TIMEOUT_MS }
        );
        if (authResponse.status() !== 303)
          throw new Error(
            `Test-auth returned HTTP ${authResponse.status()}; expected HTTP 303.`
          );
        const location = authResponse.headers().location;
        if (!location)
          throw new Error('Test-auth 303 did not include a redirect location.');
        const destination = new URL(location, baseUrl);
        const expected = new URL(url);
        if (destination.origin !== expected.origin)
          throw new Error('Test-auth redirected outside capture origin.');
        if (destination.pathname !== expected.pathname)
          throw new Error(
            `Test-auth redirect target ${destination.pathname} did not match requested route ${expected.pathname}.`
          );
      }
      actions.push(`navigate:${route}`);
      const response = await page.goto(url, {
        waitUntil: route.startsWith('/app/')
          ? 'domcontentloaded'
          : 'networkidle',
        timeout: CAPTURE_TIMEOUT_MS,
      });
      observed.statusCode = response?.status() ?? null;
      if (!response || !response.ok())
        throw new Error(`HTTP ${response?.status() ?? 'unknown'}`);
      observed.finalUrl = page.url();
      observed.title = await page.title();
      if (route.startsWith('/app/')) {
        const expected = new URL(url);
        const final = new URL(observed.finalUrl);
        if (
          final.origin !== expected.origin ||
          final.pathname !== expected.pathname
        )
          throw new Error(
            `Test-auth handoff ended at ${observed.finalUrl}, expected ${expected.toString()}.`
          );
      }
      await waitForAuthenticatedShell(page, route);
      const pageText = (await page.locator('body').innerText()).trim();
      observed.text = sanitizeCaptureText(pageText);
      actions.push('assert-original-route-outcome');
      if (!pageText || /\b404\b|content not found/i.test(pageText))
        throw new Error('Captured route did not render a meaningful surface');
      if (route.startsWith('/app/') && !/Inbox|Library|New Chat/.test(pageText))
        throw new Error(
          'Captured app route did not render authenticated shell'
        );
      if (
        route.startsWith('/app/') &&
        /Welcome back|Continue with Google/.test(pageText)
      )
        throw new Error('Captured app route rendered sign-in shell');
      const blockingFailures = blockingCaptureRuntimeFailures(runtimeFailures, {
        route,
        baseUrl,
      });
      if (blockingFailures.length > 0)
        throw new Error(
          `Captured route emitted runtime failures: ${JSON.stringify(sanitizeRuntimeFailures(blockingFailures))}`
        );
      actions.push('capture-screenshot');
      await page.screenshot({ path: outputPath, fullPage: true });
      result.status = 'captured';
    } catch (error) {
      result.status = 'failed';
      result.error = sanitizeCaptureText(error?.message ?? error);
      failureCount += 1;
      failureRecorded = true;
      console.error(`Capture failed ${route} ${viewportName}: ${result.error}`);
      await page
        ?.screenshot({ path: outputPath, fullPage: true })
        .catch(() => undefined);
    } finally {
      observed.finalUrl ||= page?.url() ?? '';
      observed.title ||= (await page?.title().catch(() => '')) ?? '';
      observed.runtimeFailures = sanitizeRuntimeFailures(runtimeFailures);
      if (context && tracingStarted) {
        try {
          await context.tracing.stop({ path: join(outDir, tracePath) });
          result.evidence.trace = tracePath;
        } catch (error) {
          result.status = 'failed';
          result.error = `Trace capture failed: ${sanitizeCaptureText(error?.message ?? error)}`;
        }
      }
      try {
        await context?.close();
      } catch (error) {
        result.status = 'failed';
        result.error = `Browser context cleanup failed: ${sanitizeCaptureText(error?.message ?? error)}`;
      }
      if (result.status === 'failed' && !failureRecorded) failureCount += 1;
    }
    return result;
  });
} finally {
  await browser.close();
}
const summary = summarizeScriptedCaptures(captures);
const evidenceManifest = {
  schema: CRITICAL_JOURNEY_CAPTURE_SCHEMA,
  sourceSha: exactHead,
  scope: {
    kind: 'risk-selected-subset',
    fullInventoryCoverage: false,
  },
  artifact: {
    kind: 'exact-source-head-local-production-build',
    revision: exactHead,
    baseUrl,
  },
  configuration: {
    authMode: 'secretless-synthetic',
    retries: 0,
    timeoutMs: CAPTURE_TIMEOUT_MS,
    stepLimit: 6,
    spendLimitUsd: 0,
    circuitBreakerFailures: CIRCUIT_BREAKER_FAILURES,
  },
  fixture: {
    revision: exactHead,
    mutable: false,
    isolation: 'per-browser-context',
  },
  browser: { name: 'chromium', version: browserVersion, viewports },
  workerCeiling: MAX_CAPTURE_WORKERS,
  workers,
  summary,
  exploratory: { status: 'not-run', findings: [] },
  semanticReview: { status: 'not-run', observations: [] },
  routes,
  viewports,
  captures,
};
await writeFile(
  join(outDir, 'manifest.json'),
  JSON.stringify(evidenceManifest, null, 2)
);
const validation = validateCaptureManifest(evidenceManifest, {
  routes,
  viewportNames: Object.keys(viewports),
});
const validationFailures = validation.failures;
if (validationFailures.length > 0) {
  await writeFile(
    join(outDir, 'capture-validation.json'),
    JSON.stringify({ ok: false, failures: validationFailures }, null, 2)
  );
  console.error('Visual capture validation failed:');
  for (const failure of validationFailures) {
    console.error(`- ${failure}`);
  }
  process.exitCode = 1;
}

/**
 * The unprivileged pull_request workflow (read-only token, no secrets) runs
 * this checked-out script from the exact PR head. Keep the
 * public footer interaction proof here so it shares this job's exact build and
 * production server rather than creating a second browser lane.
 */
async function runFooterInteractionProof() {
  if (!routes.includes('/')) return;
  // The footer theme control ships only when theme switching is enabled at
  // build time (#18820 forces dark by default); the Playwright dev-server
  // suite keeps covering it with the flag on.
  if (!isThemeSwitchingBuild(process.env)) return;

  const child = spawn(
    'pnpm',
    [
      '--filter',
      '@jovie/web',
      'exec',
      'playwright',
      'test',
      'tests/e2e/marketing-footer-controls.spec.ts',
      '--config=playwright.config.ts',
      '--project=chromium',
      '--reporter=line',
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        BASE_URL: baseUrl,
        E2E_SKIP_WEB_SERVER: '1',
        E2E_SKIP_SEED: '1',
        E2E_SKIP_WARMUP: '1',
        PR_VISUAL_OUT: outDir,
        PR_VISUAL_HEAD_SHA: exactHead ?? '',
      },
      stdio: 'inherit',
    }
  );

  const result = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => resolve({ code, signal }));
  });

  if (result.code === 0) return;

  const failure = {
    route: '/',
    exactHead,
    code: result.code,
    signal: result.signal,
    status: 'failed',
  };
  await writeFile(
    join(outDir, 'footer-interaction-failure.json'),
    JSON.stringify(failure, null, 2)
  );
  throw new Error(
    `Footer interaction proof failed (code=${result.code ?? 'null'}, signal=${result.signal ?? 'null'})`
  );
}

await runFooterInteractionProof();

function isThemeSwitchingBuild(env) {
  const flag = env.NEXT_PUBLIC_FEATURE_THEME_SWITCHING;
  return flag === '1' || flag === 'true';
}
