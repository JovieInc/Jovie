#!/usr/bin/env node
/**
 * node scripts/subscription-cli-guard.mjs [--check]  fail on a new subscription-CLI model call
 * node scripts/subscription-cli-guard.mjs --write    lower the ratchet to today's counts (never raises it)
 *
 * Automation, evals and CI must not call a model through a person's consumer
 * subscription CLI (`claude -p`, `codex exec`, `gemini -p`, `cursor-agent -p`)
 * (JOV-10091; ops/registry/fleet.json lane-claude tos: forbidden). Model calls
 * from code go through a sanctioned API route: apps/web/lib/ai/sdk.ts, or the
 * Workers AI relay per apps/web/lib/ai/routing.json.
 *
 * Two lists, both in scripts/lib/subscription-cli-guard.json:
 * - allowlist: the fleet's authorized mesh executors (ops/registry/fleet.json
 *   lane-codex seats, the Hermes CLI worker). Each entry names its executor
 *   and reason. Eval and CI paths can never be allowlisted.
 * - ratchet: grandfathered call sites that predate the guard; counts only shrink.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const CONFIG_PATH = 'scripts/lib/subscription-cli-guard.json';
export const CONFIG_SCHEMA = 'jovie.subscription-cli-guard/v1';

const SCANNED = /\.(?:ts|tsx|js|mjs|cjs|mts|cts|py|sh|bash|ya?ml)$/u;
const SKIPPED =
  /(?:^|\/)(?:node_modules|docs|canon|fixtures|__tests__|tests?|__snapshots__)\/|\.(?:test|spec|stories|gen)\.|(?:^|\/)test_[^/]+\.py$|^\.agents\/|^scripts\/(?:lib\/)?subscription-cli-guard/u;

/** Eval/automation paths that may never be allowlisted (ratchet only, to shrink). */
export const NEVER_ALLOWED =
  /^(?:scripts\/(?:buyer-eval|funnel-judge|dogfood-judge|evals?)\/|\.github\/(?:workflows|scripts|actions)\/)/u;

export const PATTERNS = Object.freeze([
  // Shell, YAML and command strings: `claude -p`, `claude --model x --print`,
  // `"$CLAUDE_BIN" -p`, `gemini -p`, `cursor-agent -p`.
  /(?:^|[\s"'`;|&(=/])(?:claude|gemini|cursor-agent|"?\$\{?(?:CLAUDE|GEMINI)_BIN\}?"?)(?:\s+--?[\w-]+(?:[= ](?!-)\S+)?)*?\s+(?:-p|--print)(?=[\s"'`)]|$)/u,
  // `codex exec` (also through $CODEX_BIN).
  /(?:^|[\s"'`;|&(=/])(?:codex|"?\$\{?CODEX_BIN\}?"?)\s+exec(?=[\s"'`)]|$)/u,
  // Spawning the CLI binary with args built elsewhere: spawn('claude', args).
  /\b(?:spawn|spawnSync|execFile|execFileSync|execa|execaSync)\(\s*['"](?:claude|codex|gemini|cursor-agent)['"]/u,
]);

/**
 * Argument vectors, possibly split over lines: ["claude", "-p"],
 * spawn('codex', ['exec', ...]), run(CODEX_BIN,\n ['exec', ...]), [cli(), "exec"].
 * Matched over a window of the line and the next three code lines.
 */
export const ARGV_PATTERN =
  /(?:['"](?:claude|codex|gemini|cursor-agent)['"]|\b\w*(?:CLAUDE|CODEX|GEMINI)_BIN\w*|\bcli\(\))\s*,\s*\[?\s*['"](?:-p|--print|exec)['"]/u;
const ARGV_WINDOW = 4;

const COMMENT = /^\s*(?:\/\/|#|\*|\/\*)/u;

export function scannable(path) {
  return SCANNED.test(path) && !SKIPPED.test(path);
}

/** Lines that call a subscription CLI. Comment lines never count. */
export function hitsIn(text) {
  const code = text
    .split('\n')
    .map((line, index) => ({ line: index + 1, text: line.trim() }))
    .filter(row => row.text && !COMMENT.test(row.text));
  const hits = [];
  code.forEach((row, index) => {
    const window = code
      .slice(index, index + ARGV_WINDOW)
      .map(next => next.text)
      .join(' ');
    const argv = ARGV_PATTERN.exec(window);
    if (
      PATTERNS.some(pattern => pattern.test(row.text)) ||
      (argv && argv.index < row.text.length)
    )
      hits.push({ line: row.line, text: row.text.slice(0, 160) });
  });
  return hits;
}

export function scan(root, files) {
  const found = {};
  for (const file of files) {
    if (!scannable(file)) continue;
    let text;
    try {
      text = readFileSync(join(root, file), 'utf8');
    } catch {
      continue;
    }
    const hits = hitsIn(text);
    if (hits.length) found[file] = hits;
  }
  return found;
}

/** Config errors: an allowlist entry needs a fleet id and reason, and never sits in an eval/CI path. */
export function configErrors(config) {
  const errors = [];
  for (const [file, entry] of Object.entries(config.allowlist ?? {})) {
    if (NEVER_ALLOWED.test(file))
      errors.push(`${file}: eval/CI paths cannot be allowlisted`);
    if (!entry?.executor || !entry?.reason)
      errors.push(`${file}: allowlist entry needs executor and reason`);
  }
  return errors;
}

export function violations(found, config) {
  const allow = config.allowlist ?? {};
  const ratchet = config.ratchet ?? {};
  return Object.entries(found)
    .filter(([file]) => !allow[file])
    .filter(([file, hits]) => hits.length > (ratchet[file] ?? 0))
    .map(([file, hits]) => ({
      file,
      found: hits.length,
      allowed: ratchet[file] ?? 0,
      hits,
    }));
}

export function tighten(found, ratchet) {
  const next = {};
  for (const [file, allowed] of Object.entries(ratchet)) {
    const n = found[file]?.length ?? 0;
    if (n > 0) next[file] = Math.min(allowed, n);
  }
  return Object.fromEntries(Object.entries(next).sort());
}

function root() {
  const top = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    encoding: 'utf8',
  });
  return top.status === 0 ? top.stdout.trim() : process.cwd();
}

function trackedFiles(cwd) {
  const out = spawnSync('git', ['ls-files', '-z'], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 1 << 28,
  });
  return out.stdout.split('\0').filter(Boolean);
}

export function main(argv = process.argv.slice(2)) {
  const cwd = root();
  const path = join(cwd, CONFIG_PATH);
  const config = existsSync(path)
    ? JSON.parse(readFileSync(path, 'utf8'))
    : { schema: CONFIG_SCHEMA, allowlist: {}, ratchet: {} };
  const errors = configErrors(config);
  if (errors.length) {
    for (const error of errors)
      console.error(`subscription-cli-guard: ${error}`);
    return 1;
  }
  const found = scan(cwd, trackedFiles(cwd));
  if (argv.includes('--write')) {
    writeFileSync(
      path,
      `${JSON.stringify({ ...config, ratchet: tighten(found, config.ratchet ?? {}) }, null, 2)}\n`
    );
    return 0;
  }
  const bad = violations(found, config);
  if (bad.length) {
    console.error(
      'subscription-cli-guard: model call through a consumer subscription CLI (JOV-10091):'
    );
    for (const v of bad) {
      console.error(`  ${v.file}: ${v.found} found, ${v.allowed} allowed`);
      for (const hit of v.hits) console.error(`    ${hit.line}: ${hit.text}`);
    }
    console.error(
      'Call models through a sanctioned API route (apps/web/lib/ai/sdk.ts, or the Workers AI relay per apps/web/lib/ai/routing.json). Only fleet mesh executors listed in scripts/lib/subscription-cli-guard.json may spawn these CLIs.'
    );
    return 1;
  }
  const slack = Object.entries(config.ratchet ?? {}).filter(
    ([file, n]) => (found[file]?.length ?? 0) < n
  ).length;
  if (slack)
    console.log(
      `subscription-cli-guard: ok; ${slack} grandfathered file(s) can shrink (run --write)`
    );
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href)
  process.exit(main());
