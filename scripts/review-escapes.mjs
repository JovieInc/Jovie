#!/usr/bin/env node
/**
 * Escape tracking: every post-merge "fix:" or revert is traced to the PR that
 * introduced the bug and labelled with the cheapest layer that should have
 * caught it. Deterministic, zero-token, git-only.
 *
 *   node scripts/review-escapes.mjs report [--days 30] [--write-latest]
 *       Scan merged commits on the current branch, write
 *       docs/metrics/review-escapes-latest.json (shipping-slo embeds a compact
 *       copy so Summer sees it in the lanes status feed).
 *   node scripts/review-escapes.mjs replay-cases [--days 120]
 *       Print escapes as replay cases (JSONL) for the risk-tier reviewer.
 *
 * Link rule: a commit whose subject starts with fix/revert/hotfix and that
 * names an earlier merged PR (#N) or reverts it, within 48h, is an escape of
 * that PR. Layer labels are heuristics from the fix's touched paths; a human
 * or agent can override one in docs/metrics/review-escape-labels.json
 * ({ "<originPr>": "<layer>" }) and escaped classes become replay cases.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const LAYERS = [
  'preflight',
  'unit_test',
  'ci_guard',
  'risk_tier_review',
  'production_cert',
];
export const ESCAPE_WINDOW_HOURS = 48;
export const RISK_PATH =
  /(^|\/)(auth|billing|entitlement|entitlements|stripe|migrations?|drizzle|privacy|secrets?)(\/|[.-]|$)|^\.github\/workflows\/|^apps\/summer\/.*(money|release|spend)/iu;
const FIX_SUBJECT = /^(fix|revert|hotfix)\b/iu;
const NOT_AN_ORIGIN =
  /^(fix|revert|hotfix|chore|deps|deps-dev|ci\(deps\)|docs)\b|\[auto\]/iu;
const TEST_PATH =
  /(^|\/)(__tests__|tests?|e2e)\/|\.(test|spec)\.[^/]+$|invariants|eslint|biome|lint/iu;
const PROD_PATH = /e2e|golden|probe|certif|smoke/iu;
const PREFLIGHT_PATH = /(eslint|biome|lint|lefthook|pre-?push|pre-?commit)/iu;
const CI_PATH = /^\.github\/|^scripts\/.*(guard|check|ratchet|invariant)/iu;
const PR_SUBJECT = /\(#(\d+)\)\s*$/u;

/** commits: [{ sha, ts (s), subject, body, files: [{ path, added }] }] */
export function findEscapes(commits, { labels = {} } = {}) {
  const byPr = new Map();
  for (const c of commits) {
    const m = PR_SUBJECT.exec(c.subject);
    if (m) byPr.set(Number(m[1]), { ...c, pr: Number(m[1]) });
  }
  const escapes = [];
  const seen = new Set();
  for (const fix of byPr.values()) {
    if (!FIX_SUBJECT.test(fix.subject)) continue;
    const refs = new Set(
      [...`${fix.subject}\n${fix.body}`.matchAll(/#(\d{3,6})\b/gu)].map(m =>
        Number(m[1])
      )
    );
    refs.delete(fix.pr);
    for (const ref of refs) {
      const origin = byPr.get(ref);
      const hours = origin ? (fix.ts - origin.ts) / 3600 : -1;
      if (!origin || hours <= 0 || hours > ESCAPE_WINDOW_HOURS) continue;
      if (NOT_AN_ORIGIN.test(origin.subject)) continue;
      const key = `${origin.pr}:${fix.pr}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const kind = /^revert/iu.test(fix.subject) ? 'revert' : 'fix';
      escapes.push({
        originPr: origin.pr,
        fixPr: fix.pr,
        kind,
        hours: Number(hours.toFixed(1)),
        layer: labels[origin.pr] ?? attributeLayer(origin, fix),
        guardAdded: addsGuard(fix),
      });
    }
  }
  return escapes;
}

/** Cheapest layer that should have caught it, from the fix's touched paths. */
export function attributeLayer(origin, fix) {
  const fixPaths = fix.files.map(f => f.path);
  const originRisky = origin.files.some(f => RISK_PATH.test(f.path));
  if (
    fixPaths.some(p => PROD_PATH.test(p)) &&
    !fixPaths.some(p => !PROD_PATH.test(p) && !TEST_PATH.test(p))
  )
    return 'production_cert';
  if (fixPaths.length > 0 && fixPaths.every(p => PREFLIGHT_PATH.test(p)))
    return 'preflight';
  if (fixPaths.some(p => CI_PATH.test(p))) return 'ci_guard';
  if (originRisky || fixPaths.some(p => RISK_PATH.test(p)))
    return 'risk_tier_review';
  return 'unit_test';
}

/** A fix leaves a guard when it adds lines to a test, invariant or lint file. */
export function addsGuard(fix) {
  return fix.files.some(f => TEST_PATH.test(f.path) && f.added > 0);
}

export function summarize(commits, escapes, { days }) {
  const merged = commits.filter(
    c => PR_SUBJECT.test(c.subject) && !NOT_AN_ORIGIN.test(c.subject)
  ).length;
  const origins = new Set(escapes.map(e => e.originPr));
  const byLayer = Object.fromEntries(LAYERS.map(l => [l, 0]));
  for (const e of escapes) byLayer[e.layer] += 1;
  const unguarded = escapes.filter(e => !e.guardAdded);
  return {
    schema: 'jovie-review-escapes/v1',
    windowDays: days,
    mergedPrs: merged,
    escapedPrs: origins.size,
    escapeRate:
      merged === 0 ? null : Number((origins.size / merged).toFixed(4)),
    byLayer,
    guardRate:
      escapes.length === 0
        ? null
        : Number((1 - unguarded.length / escapes.length).toFixed(4)),
    unguarded: unguarded.slice(0, 20).map(e => ({
      originPr: e.originPr,
      fixPr: e.fixPr,
      layer: e.layer,
    })),
    escapes,
  };
}

function git(args, cwd) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

/** @param {{ days?: number, cwd?: string, run?: typeof git }} [options] */
export function readCommits({ days, cwd = process.cwd(), run = git } = {}) {
  const logArgs = [
    'log',
    `--since=${days} days ago`,
    '--no-merges',
    '--format=%x1e%H%x1f%ct%x1f%s%x1f%b%x1f',
  ];
  let raw;
  try {
    raw = run([...logArgs, '--numstat'], cwd);
  } catch {
    // A partial clone can lack blobs; PR linkage still works without paths.
    raw = run(['--no-lazy-fetch', ...logArgs], cwd);
  }
  return raw
    .split('\x1e')
    .filter(Boolean)
    .map(rec => {
      const [sha, ts, subject, body, rest = ''] = rec.split('\x1f');
      const files = rest
        .split('\n')
        .map(l => l.split('\t'))
        .filter(p => p.length === 3)
        .map(([added, , path]) => ({ path, added: Number(added) || 0 }));
      return { sha, ts: Number(ts), subject, body, files };
    });
}

function main() {
  const [command = 'report', ...args] = process.argv.slice(2);
  const arg = (name, fallback) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : fallback;
  };
  const root = resolve(fileURLToPath(import.meta.url), '../..');
  const labelsPath = resolve(root, 'docs/metrics/review-escape-labels.json');
  const labels = existsSync(labelsPath)
    ? JSON.parse(readFileSync(labelsPath, 'utf8'))
    : {};
  const days = Number(arg('--days', command === 'replay-cases' ? '120' : '30'));
  const commits = readCommits({ days, cwd: root });
  const report = summarize(commits, findEscapes(commits, { labels }), { days });
  if (command === 'replay-cases') {
    for (const e of report.escapes) console.log(JSON.stringify(e));
    return;
  }
  const text = `${JSON.stringify({ ...report, generatedAt: new Date().toISOString() }, null, 2)}\n`;
  if (args.includes('--write-latest'))
    writeFileSync(
      resolve(root, 'docs/metrics/review-escapes-latest.json'),
      text
    );
  else process.stdout.write(text);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
