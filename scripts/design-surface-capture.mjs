#!/usr/bin/env node
// Captures full-page screenshots of stale certified routes for the
// recertification bot. Usage:
//   node scripts/design-surface-capture.mjs --base-url http://127.0.0.1:3100 --out DIR
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { checkCensus } from './design-surface-census.mjs';
import {
  CAPTURE_VIEWPORTS,
  capturable,
  captureSlug,
} from './design-surface-recertify.mjs';

const args = process.argv.slice(2);
const value = flag => args[args.indexOf(flag) + 1];
const baseUrl = value('--base-url');
const out = resolve(value('--out') ?? 'surface-captures');
if (!baseUrl) {
  console.error('--base-url is required');
  process.exit(2);
}

const require = createRequire(join(process.cwd(), 'apps/web/package.json'));
const { chromium } = require('@playwright/test');
const { rows, stale } = checkCensus(process.cwd(), 'origin/main');
const browser = await chromium.launch();
let failures = 0;
for (const source of stale) {
  const row = rows.find(candidate => candidate.source === source);
  if (!capturable(row)) {
    console.warn(`skip ${source}: route needs a session or fixture`);
    continue;
  }
  for (const [name, size] of Object.entries(CAPTURE_VIEWPORTS)) {
    const context = await browser.newContext({
      viewport: size,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    try {
      const response = await page.goto(`${baseUrl}${row.route}`, {
        waitUntil: 'networkidle',
        timeout: 60_000,
      });
      if (!response || response.status() >= 400) {
        throw new Error(`HTTP ${response?.status()}`);
      }
      await page.evaluate('document.fonts.ready');
      const dir = join(out, captureSlug(source));
      mkdirSync(dir, { recursive: true });
      await page.screenshot({ path: join(dir, `${name}.png`), fullPage: true });
    } catch (error) {
      failures += 1;
      console.error(`capture failed ${row.route} ${name}: ${error.message}`);
    } finally {
      await context.close();
    }
  }
}
await browser.close();
process.exitCode = failures > 0 ? 1 : 0;
