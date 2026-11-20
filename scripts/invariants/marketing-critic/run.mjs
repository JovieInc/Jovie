#!/usr/bin/env node
/**
 * Marketing visual-critic gate. Runs the deterministic detectors against
 * rendered marketing routes and records every finding to JSONL so precision
 * can be measured (calibrate.mjs). Warn-only while marketing-critic.config.json
 * is in shadow mode: findings become ::warning annotations and a step summary,
 * and the exit code stays 0.
 *
 *   node scripts/invariants/marketing-critic/run.mjs --base-url http://127.0.0.1:3100 \
 *     [--changed-files <file>] [--routes /,/pricing] [--widths 1440,390] \
 *     [--out pr-visual-artifacts/marketing-critic] [--source pr|prod|local]
 */
import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runDetectors } from './detectors.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(HERE, '../../..');
export const CONFIG_PATH = join(HERE, 'marketing-critic.config.json');
export const FINDINGS_SCHEMA = 'jovie.marketing-critic-finding/v1';

export const MARKETING_SCOPE =
  /^apps\/web\/(?:app\/\((?:marketing|home)\)\/|components\/(?:marketing|homepage)\/|data\/marketing)/;

export function loadConfig(path = CONFIG_PATH) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/** Map an app-router file to its URL path, or null when it is not a page. */
export function routeForFile(file) {
  const m =
    /^apps\/web\/app\/(.+)\/page\.(?:tsx|ts|jsx|js|mdx)$/.exec(file) ??
    (/^apps\/web\/app\/page\.(?:tsx|ts)$/.test(file) ? [file, ''] : null);
  if (!m) return null;
  const segments = m[1] ? m[1].split('/') : [];
  if (
    segments.some(
      s => s.startsWith('[') || s.startsWith('@') || s.startsWith('_')
    )
  )
    return null;
  const kept = segments.filter(s => !/^\(.+\)$/.test(s));
  return `/${kept.join('/')}`;
}

/**
 * Pick routes for a PR diff. A changed page maps to its own route; any other
 * marketing input (shared components, data) checks every configured route.
 */
export function selectRoutes(changedFiles, config) {
  const scoped = changedFiles.filter(f => MARKETING_SCOPE.test(f));
  if (scoped.length === 0) return { routes: [], reason: 'no-marketing-change' };
  const routes = new Set();
  let shared = false;
  for (const file of scoped) {
    const route = routeForFile(file);
    if (route) routes.add(route);
    else shared = true;
  }
  if (shared)
    return { routes: [...config.routes], reason: 'shared-marketing-input' };
  return { routes: [...routes].sort(), reason: 'changed-pages' };
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i].replace(/^--/, '');
    args[key] = argv[i + 1];
    i += 1;
  }
  return args;
}

export function summarize(rows, meta) {
  const findings = rows.filter(r => r.kind === 'finding');
  const runs = rows.filter(r => r.kind === 'route-run');
  const lines = [
    '## Marketing visual critic (warn-only)',
    '',
    `Mode: \`${meta.mode}\`. ${runs.length} route/width runs, ${findings.length} findings. Rubric: \`docs/design-system/marketing-critic-rubric.json\`.`,
    '',
  ];
  if (findings.length) {
    lines.push(
      '| Route | Width | Class | Detector | Finding |',
      '|---|---|---|---|---|'
    );
    for (const f of findings) {
      const ex = f.examples?.[0]?.text
        ? ` (\`${f.examples[0].text.replace(/[|`]/g, ' ')}\`)`
        : '';
      lines.push(
        `| ${f.route} | ${f.width} | ${f.class} | ${f.detector} | ${f.message.replace(/\|/g, ' ')}${ex} |`
      );
    }
  }
  const errors = runs.filter(r => r.status !== 'ok');
  if (errors.length) {
    lines.push('', `${errors.length} route runs did not complete:`);
    for (const e of errors)
      lines.push(`- ${e.route} @${e.width}: ${e.status} ${e.error ?? ''}`);
  }
  lines.push(
    '',
    'Wrong finding? Label it: `node scripts/invariants/marketing-critic/calibrate.mjs label <route> <class> <defect|clean> <source> <evidence...>`.'
  );
  return `${lines.join('\n')}\n`;
}

export async function runGate({
  baseUrl,
  routes,
  widths,
  config,
  source,
  sha,
  chromium,
}) {
  const rows = [];
  const at = new Date().toISOString();
  const runId = `${source}:${sha ?? 'local'}:${at}`;
  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of widths) {
      const context = await browser.newContext({
        viewport: { width, height: width >= 1024 ? 900 : 844 },
        reducedMotion: 'reduce',
        deviceScaleFactor: 1,
      });
      for (const route of routes) {
        const page = await context.newPage();
        const base = {
          schema: FINDINGS_SCHEMA,
          runId,
          at,
          source,
          sha: sha ?? null,
          route,
          width,
        };
        try {
          const res = await page.goto(new URL(route, baseUrl).toString(), {
            waitUntil: 'load',
            timeout: 45_000,
          });
          await page.waitForTimeout(800);
          const status = res?.status() ?? 0;
          if (status >= 400) {
            rows.push({
              ...base,
              kind: 'route-run',
              status: `http-${status}`,
              detectors: [],
            });
            continue;
          }
          const found = await runDetectors(page, {
            pixelShareMax: config.pixelShareMax,
          });
          for (const f of found) rows.push({ ...base, kind: 'finding', ...f });
          rows.push({
            ...base,
            kind: 'route-run',
            status: 'ok',
            detectors: Object.keys(config.detectorModes),
          });
        } catch (error) {
          rows.push({
            ...base,
            kind: 'route-run',
            status: 'error',
            error: String(error?.message ?? error).slice(0, 200),
            detectors: [],
          });
        } finally {
          await page.close();
        }
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
  return rows;
}

/** Findings from detectors explicitly promoted to blocking. Empty in shadow mode. */
export function blockingFindings(rows, config) {
  if (!config.promoteToBlocking) return [];
  return rows.filter(
    r =>
      r.kind === 'finding' && config.detectorModes?.[r.detector] === 'blocking'
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = loadConfig();
  const out = args.out ?? 'pr-visual-artifacts/marketing-critic';
  mkdirSync(out, { recursive: true });
  let selection;
  if (args.routes)
    selection = {
      routes: args.routes.split(',').filter(Boolean),
      reason: 'explicit',
    };
  else if (args['changed-files'])
    selection = selectRoutes(
      readFileSync(args['changed-files'], 'utf8').split('\n').filter(Boolean),
      config
    );
  else selection = { routes: [...config.routes], reason: 'all-configured' };
  const widths = (args.widths ?? config.widths.join(','))
    .split(',')
    .map(Number);
  const meta = { mode: config.mode, reason: selection.reason };
  if (selection.routes.length === 0) {
    writeFileSync(join(out, 'findings.jsonl'), '');
    writeFileSync(
      join(out, 'summary.md'),
      `Marketing visual critic skipped: ${selection.reason}.\n`
    );
    process.stdout.write(`marketing-critic: skipped (${selection.reason})\n`);
    return;
  }
  const requireFromWeb = createRequire(
    join(REPO_ROOT, 'apps/web/package.json')
  );
  const { chromium } = requireFromWeb('playwright');
  const rows = await runGate({
    baseUrl:
      args['base-url'] ?? process.env.BASE_URL ?? 'http://127.0.0.1:3100',
    routes: selection.routes,
    widths,
    config,
    source: args.source ?? (process.env.GITHUB_ACTIONS ? 'pr' : 'local'),
    sha: args.sha ?? process.env.EXPECTED_COMMIT_SHA ?? null,
    chromium,
  });
  writeFileSync(
    join(out, 'findings.jsonl'),
    rows.map(r => JSON.stringify(r)).join('\n') + '\n'
  );
  const summary = summarize(rows, meta);
  writeFileSync(join(out, 'summary.md'), summary);
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  const findings = rows.filter(r => r.kind === 'finding');
  if (process.env.GITHUB_ACTIONS) {
    for (const f of findings.slice(0, 40)) {
      const msg = `${f.route} @${f.width}px: ${f.message}`.replace(
        /[\r\n]+/g,
        ' '
      );
      process.stdout.write(
        `::warning title=marketing-critic/${f.class} (${f.detector})::${msg}\n`
      );
    }
  }
  process.stdout.write(
    `marketing-critic: ${findings.length} findings over ${rows.length - findings.length} route runs (${selection.reason}); mode ${config.mode}\n`
  );
  const blocking = blockingFindings(rows, config);
  if (blocking.length) {
    process.stderr.write(
      `marketing-critic: ${blocking.length} findings from blocking detectors\n`
    );
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(error => {
    // Shadow mode never fails the job on a harness error; it records it.
    process.stdout.write(
      `::warning title=marketing-critic::harness error ${String(error?.message ?? error)}\n`
    );
    if (loadConfig().promoteToBlocking) process.exitCode = 1;
  });
}
