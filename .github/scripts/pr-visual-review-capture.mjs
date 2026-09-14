#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import {
  blockingCaptureRuntimeFailures,
  buildCaptureArtifactPaths,
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
if (!Array.isArray(routes) || routes.length === 0)
  throw new Error('No routes supplied');

/**
 * Next production streaming can paint the app-shell Suspense fallback
 * (unlabeled skeleton + aria-hidden Just ask) before DashboardShellContent
 * resolves. Capture must wait for the live authenticated chrome, not the
 * first HTML chunk. JOV-5387 New Chat evidence also requires the loaded
 * empty-state heading, which is not aria-hidden.
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
    // Loading still-frame uses the same test id with aria-hidden. Capture the
    // loaded Just ask heading, which must stay visible with starter-action cards.
    await page
      .getByRole('heading', { name: 'Just ask' })
      .and(page.getByTestId('chat-empty-state-greeting'))
      .filter({ visible: true })
      .first()
      .waitFor({
        state: 'visible',
        timeout: NEW_CHAT_EMPTY_WAIT_MS,
      });
  }
}

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const manifest = [];
try {
  for (const route of routes) {
    for (const [viewportName, viewport] of Object.entries(viewports)) {
      const context = await browser.newContext({
        viewport,
        colorScheme: 'dark',
        deviceScaleFactor: 1,
      });
      const page = await context.newPage();
      const runtimeFailures = [];
      page.on('console', message => {
        if (message.type() === 'error') {
          runtimeFailures.push({
            type: 'console-error',
            message: message.text(),
          });
        }
      });
      page.on('pageerror', error => {
        runtimeFailures.push({ type: 'page-error', message: error.message });
      });
      page.on('response', response => {
        if (response.status() >= 500) {
          runtimeFailures.push({
            type: 'http-5xx',
            status: response.status(),
            url: response.url(),
          });
        }
      });
      const url = new URL(route, baseUrl).toString();
      const { artifactPath, outputPath } = buildCaptureArtifactPaths({
        outDir,
        route,
        viewportName,
      });
      try {
        if (route.startsWith('/app/')) {
          const authEntryUrl = new URL(
            `/api/dev/test-auth/enter?persona=creator-ready&redirect=${encodeURIComponent(route)}`,
            baseUrl
          );
          const authResponse = await context.request.get(
            authEntryUrl.toString(),
            {
              maxRedirects: 0,
              timeout: 45_000,
            }
          );
          if (authResponse.status() !== 303) {
            throw new Error(
              `Test-auth returned HTTP ${authResponse.status()}; expected HTTP 303.`
            );
          }
          const location = authResponse.headers().location;
          if (!location)
            throw new Error(
              'Test-auth 303 did not include a redirect location.'
            );
          const destination = new URL(location, baseUrl);
          const expected = new URL(url);
          if (destination.origin !== expected.origin)
            throw new Error('Test-auth redirected outside capture origin.');
          if (destination.pathname !== expected.pathname) {
            throw new Error(
              `Test-auth redirect target ${destination.pathname} did not match requested route ${expected.pathname}.`
            );
          }
        }
        const response = await page.goto(url, {
          waitUntil: route.startsWith('/app/')
            ? 'domcontentloaded'
            : 'networkidle',
          timeout: 45_000,
        });
        if (!response || !response.ok())
          throw new Error(`HTTP ${response?.status() ?? 'unknown'}`);
        if (route.startsWith('/app/')) {
          const expected = new URL(url);
          const final = new URL(page.url());
          if (
            final.origin !== expected.origin ||
            final.pathname !== expected.pathname
          )
            throw new Error(
              `Test-auth handoff ended at ${page.url()}, expected ${expected.toString()}.`
            );
        }
        await waitForAuthenticatedShell(page, route);
        const pageText = (await page.locator('body').innerText()).trim();
        if (!pageText || /\b404\b|content not found/i.test(pageText))
          throw new Error('Captured route did not render a meaningful surface');
        if (
          route.startsWith('/app/') &&
          !/Inbox|Library|New Chat/.test(pageText)
        )
          throw new Error(
            'Captured app route did not render authenticated shell'
          );
        if (
          route.startsWith('/app/') &&
          /Welcome back|Continue with Google/.test(pageText)
        )
          throw new Error('Captured app route rendered sign-in shell');
        const blockingFailures = blockingCaptureRuntimeFailures(
          runtimeFailures,
          { route, baseUrl }
        );
        if (blockingFailures.length > 0) {
          throw new Error(
            `Captured route emitted runtime failures: ${JSON.stringify(blockingFailures)}`
          );
        }
        await page.screenshot({ path: outputPath, fullPage: true });
        manifest.push({
          route,
          viewport: viewportName,
          path: artifactPath,
          status: 'captured',
        });
      } catch (error) {
        const message = String(error.message ?? error);
        console.error(`Capture failed ${route} ${viewportName}: ${message}`);
        try {
          await page.screenshot({ path: outputPath, fullPage: true });
        } catch {
          // Best-effort failure evidence; the capture status stays failed.
        }
        manifest.push({
          route,
          viewport: viewportName,
          path: artifactPath,
          status: 'failed',
          error: message,
        });
      } finally {
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
}
await writeFile(
  join(outDir, 'manifest.json'),
  JSON.stringify({ baseUrl, routes, viewports, captures: manifest }, null, 2)
);
const validation = validateCaptureManifest(
  { routes, viewports, captures: manifest },
  { routes, viewportNames: Object.keys(viewports) }
);
if (!validation.ok) {
  await writeFile(
    join(outDir, 'capture-validation.json'),
    JSON.stringify(validation, null, 2)
  );
  console.error('Visual capture validation failed:');
  for (const failure of validation.failures) {
    console.error(`- ${failure}`);
  }
  process.exitCode = 1;
}

/**
 * The protected pull_request_target workflow runs this checked-out script from
 * the PR head, while its YAML remains sourced from the base branch. Keep the
 * public footer interaction proof here so it shares this job's exact build and
 * production server rather than creating a second browser lane.
 */
async function runFooterInteractionProof() {
  if (!routes.includes('/')) return;

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
