#!/usr/bin/env node
// CLI for automatic surface recertification.
//   node scripts/surface-recertify.mjs list                      stale canonical groups as JSON (exit 0)
//   node scripts/surface-recertify.mjs capture --base-url U --out DIR
//   node scripts/surface-recertify.mjs apply --evidence DIR --run-url URL --artifact NAME --sha SHA
// `capture` needs Playwright; `list` and `apply` are node-only.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { CENSUS_PATH } from './design-surface-census.mjs';
import {
  REQUIRED_WIDTHS,
  readCensus,
  renewGroup,
  requiresAuth,
  staleGroups,
} from './lib/surface-recertify.mjs';

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    root: { type: 'string', default: process.cwd() },
    'base-url': { type: 'string' },
    out: { type: 'string' },
    evidence: { type: 'string' },
    'run-url': { type: 'string' },
    artifact: { type: 'string' },
    sha: { type: 'string' },
  },
});
const root = values.root;
const [command = 'list'] = positionals;

async function capture() {
  // Playwright is a dependency of apps/web, not of the repo root.
  const { chromium } = createRequire(join(root, 'apps/web/package.json'))(
    'playwright'
  );
  const browser = await chromium.launch();
  const stale = staleGroups(root).filter(group => group.recertifiable);
  const authFailures = [];
  for (const group of stale) {
    const dir = join(values.out, group.id);
    mkdirSync(dir, { recursive: true });
    const record = { id: group.id, route: group.route, shots: [] };
    for (const width of REQUIRED_WIDTHS) {
      const context = await browser.newContext({
        viewport: { width, height: 900 },
      });
      // App routes need a test-auth session; without one they redirect to
      // /signin and answer 200 with the wrong page. Fail loudly instead.
      let authStatus;
      if (requiresAuth(group.route)) {
        const auth = await context.request.post(
          new URL('/api/dev/test-auth/session', values['base-url']).href,
          { data: { persona: 'creator-ready' }, timeout: 240_000 }
        );
        authStatus = auth.status();
        if (authStatus !== 200) {
          authFailures.push(
            `${group.id} ${width}px test sign-in HTTP ${authStatus}`
          );
        }
      }
      const page = await context.newPage();
      const pageErrors = [];
      page.on('pageerror', error =>
        pageErrors.push(String(error.message).slice(0, 160))
      );
      let status = 0;
      try {
        const response = await page.goto(
          new URL(group.route, values['base-url']).href,
          {
            waitUntil: 'networkidle',
            timeout: 120_000,
          }
        );
        status = response?.status() ?? 0;
        const metrics = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }));
        const file = `${group.route.replace(/\W+/g, '_') || 'root'}-${width}.png`;
        const buffer = await page.screenshot({
          path: join(dir, file),
          fullPage: true,
        });
        record.shots.push({
          width,
          file,
          status,
          authStatus,
          finalPath: new URL(page.url()).pathname.replace(/(.)\/$/, '$1'),
          bytes: buffer.length,
          sha256: createHash('sha256').update(buffer).digest('hex'),
          pageErrors,
          ...metrics,
        });
      } catch (error) {
        record.shots.push({
          width,
          status,
          authStatus,
          error: String(error.message).slice(0, 200),
        });
      } finally {
        await context.close();
      }
    }
    writeFileSync(
      join(dir, 'capture.json'),
      `${JSON.stringify(record, null, 2)}\n`
    );
  }
  await browser.close();
  if (authFailures.length) {
    console.error(`::error::test sign-in failed: ${authFailures.join('; ')}`);
    process.exitCode = 1;
  }
}

function apply() {
  const sha = values.sha ?? '';
  let census = readCensus(root);
  const renewed = [];
  const failed = [];
  // Not recertifiable by design (dynamic route, multi-source); not a failure.
  const skipped = [];
  for (const group of staleGroups(root, census)) {
    if (!group.recertifiable) {
      skipped.push(`${group.id}: ${group.reasons.join(', ')}`);
      continue;
    }
    try {
      const capture = JSON.parse(
        readFileSync(join(values.evidence, group.id, 'capture.json'), 'utf8')
      );
      census = renewGroup(census, group, {
        capture,
        at: new Date().toISOString(),
        runUrl: values['run-url'],
        artifactName: values.artifact,
        sha,
      });
      renewed.push(group.id);
    } catch (error) {
      failed.push(String(error.message));
    }
  }
  if (renewed.length)
    writeFileSync(
      join(root, CENSUS_PATH),
      `${JSON.stringify(census, null, 2)}\n`
    );
  console.log(JSON.stringify({ renewed, failed, skipped }, null, 2));
  // Renewals still land; the workflow fails its last step on any rejection.
  if (failed.length && !renewed.length) process.exitCode = 1;
}

if (command === 'list') {
  console.log(JSON.stringify(staleGroups(root), null, 2));
} else if (command === 'capture') {
  await capture();
} else if (command === 'apply') {
  apply();
} else {
  console.error(`unknown command ${command}`);
  process.exitCode = 2;
}
