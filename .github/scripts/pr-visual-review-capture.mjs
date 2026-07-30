#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { validateCaptureManifest } from './pr-visual-review.mjs';

const baseUrl = process.env.BASE_URL ?? 'http://127.0.0.1:3100';
const routes = JSON.parse(process.env.PR_VISUAL_ROUTES ?? '[]');
const outDir = process.env.PR_VISUAL_OUT ?? 'pr-visual-artifacts';
const viewports = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
};
if (!Array.isArray(routes) || routes.length === 0)
  throw new Error('No routes supplied');

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
      const safeRoute =
        route.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'home';
      const path = join(outDir, `${safeRoute}-${viewportName}.png`);
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
          waitUntil: 'networkidle',
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
        if (runtimeFailures.length > 0) {
          throw new Error(
            `Captured route emitted runtime failures: ${JSON.stringify(runtimeFailures)}`
          );
        }
        await page.screenshot({ path, fullPage: true });
        manifest.push({
          route,
          viewport: viewportName,
          path,
          status: 'captured',
        });
      } catch (error) {
        manifest.push({
          route,
          viewport: viewportName,
          status: 'failed',
          error: String(error.message ?? error),
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
  process.exitCode = 1;
}
