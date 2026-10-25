#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import {
  blockingCaptureRuntimeFailures,
  buildCaptureArtifactPaths,
  CAPTURE_VIEWPORTS,
  CRITICAL_JOURNEY_CAPTURE_SCHEMA,
  capturePersonaForRoute,
  captureViewportNamesForRoute,
  isOvieCaptureRoute,
  MAX_CAPTURE_WORKERS,
  resolveCaptureJourneyId,
  resolveCaptureWorkerCount,
  runCapturePool,
  sanitizeCaptureText,
  summarizeScriptedCaptures,
  validateCaptureManifest,
  validateRoutesMatchChange,
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
const viewports = CAPTURE_VIEWPORTS;
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

  if (isOvieCaptureRoute(route)) {
    // Ovie Home proof: the company HUD itself, not just the shell around it.
    await page
      .getByTestId('ovie-company-home')
      .waitFor({ state: 'visible', timeout: AUTHENTICATED_SHELL_WAIT_MS });
    // Populated, not skeletons: a company tile with a measured value.
    if (ovieFixture)
      await page
        .getByTestId('ovie-tile-revenue')
        .waitFor({ state: 'visible', timeout: AUTHENTICATED_SHELL_WAIT_MS });
    if (route.includes('fullscreen=1'))
      await page
        .getByTestId('ovie-fullscreen')
        .waitFor({ state: 'visible', timeout: AUTHENTICATED_SHELL_WAIT_MS });
    if (route.includes('fullscreen=1')) {
      // Full Screen must cover the shell: no sidebar link may be the topmost
      // element at its own position.
      const covered = await page.evaluate(() => {
        const link = [...document.querySelectorAll('a')].find(
          el => el.textContent?.trim() === 'Inbox'
        );
        if (!link) return true;
        const box = link.getBoundingClientRect();
        const top = document.elementFromPoint(
          box.x + box.width / 2,
          box.y + box.height / 2
        );
        return Boolean(top?.closest('[data-testid="ovie-fullscreen"]'));
      });
      if (!covered)
        throw new Error('Full Screen did not cover the app shell chrome');
      // Fill guard (Tim, 2026-10-25: at 3440 only the top third was filled and
      // the right edge clipped). The scaled canvas must be the viewport, with
      // no horizontal overflow and every tile inside it. Burn-in drift moves
      // the canvas by at most 10 scaled px, inside its 16 scaled px padding.
      const geometry = await page.evaluate(() => {
        const rect = selector => {
          const el = document.querySelector(selector);
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { x: r.x, y: r.y, w: r.width, h: r.height };
        };
        const frame = document.querySelector('[data-testid="ovie-fullscreen"]');
        return {
          viewport: { w: window.innerWidth, h: window.innerHeight },
          frame: rect('[data-testid="ovie-fullscreen"]'),
          canvas: rect('[data-testid="ovie-fullscreen-canvas"]'),
          tiles: [...document.querySelectorAll('[data-testid^="ovie-tile-"]')]
            .map(el => el.getBoundingClientRect())
            .map(r => ({ left: r.left, right: r.right, bottom: r.bottom })),
          overflowX:
            document.documentElement.scrollWidth > window.innerWidth ||
            (frame ? frame.scrollWidth > frame.clientWidth : false),
        };
      });
      const { viewport: vp, frame, canvas, tiles, overflowX } = geometry;
      const scaleGuess = canvas ? canvas.w / Math.max(1, vp.w) : 1;
      const slack = Math.ceil(10 * Math.max(1, vp.w / 1280)) + 1;
      const problems = [];
      if (
        !frame ||
        Math.abs(frame.w - vp.w) > 1 ||
        Math.abs(frame.h - vp.h) > 1
      )
        problems.push(
          `frame ${JSON.stringify(frame)} is not the viewport ${vp.w}x${vp.h}`
        );
      if (
        !canvas ||
        Math.abs(canvas.w - vp.w) > 1 ||
        Math.abs(canvas.h - vp.h) > 1 ||
        Math.abs(canvas.x) > slack ||
        Math.abs(canvas.y) > slack
      )
        problems.push(
          `canvas ${JSON.stringify(canvas)} does not fill ${vp.w}x${vp.h} (scale ${scaleGuess.toFixed(2)})`
        );
      if (overflowX) problems.push('horizontal overflow');
      for (const tile of tiles)
        if (tile.left < -1 || tile.right > vp.w + 1)
          problems.push(
            `tile clipped: ${tile.left.toFixed(0)}..${tile.right.toFixed(0)} of ${vp.w}`
          );
      if (tiles.length === 0 && ovieFixture) problems.push('no tiles rendered');
      // Wall-reading guards (Tim, 2026-10-25): no ellipsis or clamping, content
      // fills the height, and values are large enough to read across a room.
      const wall = await page.evaluate(() => {
        const frame = document.querySelector('[data-testid="ovie-fullscreen"]');
        const canvas = document.querySelector(
          '[data-testid="ovie-fullscreen-canvas"]'
        );
        const scale = canvas
          ? canvas.getBoundingClientRect().width /
            Math.max(1, canvas.offsetWidth)
          : 1;
        const truncated = [];
        for (const el of frame ? frame.querySelectorAll('*') : []) {
          const style = getComputedStyle(el);
          const clamped =
            style.webkitLineClamp && style.webkitLineClamp !== 'none';
          if (style.textOverflow === 'ellipsis' || clamped)
            truncated.push(
              `${el.tagName.toLowerCase()}:${(el.textContent ?? '').trim().slice(0, 40)}`
            );
        }
        const tops = [
          ...document.querySelectorAll('[data-testid^="ovie-tile-"]'),
        ].map(el => el.getBoundingClientRect().top);
        const bottoms = [
          ...document.querySelectorAll('[data-testid$="-section"]'),
        ].map(el => el.getBoundingClientRect().bottom);
        const value = document.querySelector(
          '[data-testid="ovie-tile-revenue"] span.font-semibold'
        );
        return {
          scale,
          truncated,
          contentTop: tops.length ? Math.min(...tops) : null,
          contentBottom: bottoms.length ? Math.max(...bottoms) : null,
          valuePx: value
            ? parseFloat(getComputedStyle(value).fontSize) * scale
            : null,
        };
      });
      if (wall.truncated.length > 0)
        problems.push(
          `ellipsis or line clamp in Full Screen: ${wall.truncated.slice(0, 3).join(' | ')}`
        );
      if (vp.w >= 3000) {
        const span =
          wall.contentTop === null || wall.contentBottom === null
            ? 0
            : (wall.contentBottom - wall.contentTop) / vp.h;
        if (span < 0.7)
          problems.push(
            `content fills ${(span * 100).toFixed(0)}% of the height, need 70%`
          );
        if (ovieFixture && (wall.valuePx === null || wall.valuePx < 48))
          problems.push(`tile value renders at ${wall.valuePx}px, need 48px`);
      }
      if (problems.length > 0)
        throw new Error(`Full Screen geometry: ${problems.join('; ')}`);
    }
  }

  if (route === '/app/chat' || route.startsWith('/app/chat/')) {
    // JOV-7150: the loaded empty state is one greeting sentence rendered as
    // chat-empty-state-greeting-text. The loading still-frame only renders an
    // aria-hidden skeleton inside chat-empty-state-greeting-region, so the
    // -text testid is unique to the loaded state.
    await page
      .getByRole('heading', { level: 2 })
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
// Populated Ovie Home data (no database in this lane). Timestamps in the
// fixture are 2000-01-01T00:00:SS.000Z and become now + SS seconds per request.
const ovieFixture = (() => {
  try {
    return JSON.parse(
      readFileSync(join(outDir, 'ovie-home-fixture.json'), 'utf8')
    );
  } catch {
    return null;
  }
})();
const stampFixture = value =>
  JSON.stringify(value).replace(
    /2000-01-01T00:00:(\d\d)\.000Z/g,
    (_match, seconds) =>
      new Date(Date.now() + Number(seconds) * 1000).toISOString()
  );
const browser = await chromium.launch({ headless: true });
const browserVersion = browser.version();
const targets = routes.flatMap(route =>
  captureViewportNamesForRoute(route).map(viewportName => ({
    route,
    viewportName,
    viewport: viewports[viewportName],
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
      if (isOvieCaptureRoute(route) && ovieFixture)
        await context.route('**/api/**', async intercepted => {
          const path = new URL(intercepted.request().url()).pathname;
          const payload = ovieFixture[path];
          if (payload === undefined || intercepted.request().method() !== 'GET')
            return intercepted.continue();
          return intercepted.fulfill({
            status: 200,
            contentType: 'application/json',
            headers: { 'cache-control': 'no-store' },
            body: stampFixture(payload),
          });
        });
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
        actions.push(`bootstrap-${capturePersonaForRoute(route)}-session`);
        const authEntryUrl = new URL(
          `/api/dev/test-auth/enter?persona=${capturePersonaForRoute(route)}&redirect=${encodeURIComponent(route)}`,
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
  viewportNamesForRoute: captureViewportNamesForRoute,
});
const validationFailures = [...validation.failures];
try {
  const routing = JSON.parse(
    readFileSync(join(outDir, 'routing.json'), 'utf8')
  );
  validationFailures.push(...validateRoutesMatchChange(routing.files, routes));
} catch {
  // No routing receipt (local run): the route/file guard cannot run.
}
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
