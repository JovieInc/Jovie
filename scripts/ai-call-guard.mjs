#!/usr/bin/env node
/**
 * node scripts/ai-call-guard.mjs [--check]   fail on a new raw model call
 * node scripts/ai-call-guard.mjs --write     lower the ratchet to today's counts (never raises it)
 * node scripts/ai-call-guard.mjs --bootstrap grandfather every current site (only while no ratchet exists)
 *
 * Every model call goes through apps/web/lib/ai/sdk.ts, which tags the call for
 * AI Gateway cost reports (`feature:`/`app:`) and applies cost defaults. A raw
 * import of generate/stream functions from 'ai', a direct '@ai-sdk/gateway'
 * client, or a hand-rolled ai-gateway.vercel.sh request bypasses that, so its
 * spend lands untagged. Grandfathered files live in
 * scripts/lib/ai-call-guard.ratchet.json and only shrink.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const RATCHET_PATH = 'scripts/lib/ai-call-guard.ratchet.json';
export const RATCHET_SCHEMA = 'jovie.ai-call-guard-ratchet/v1';

const SCANNED = /\.(?:ts|tsx|js|mjs|cjs|mts|cts)$/u;
const SKIPPED =
  /(?:^|\/)(?:node_modules|docs|canon|fixtures|__tests__|tests?|evals?|__snapshots__)\/|\.(?:test|spec|stories|gen)\.|^apps\/web\/lib\/ai\/sdk\.ts$|^scripts\/(?:lib\/)?ai-call-guard/u;
const RAW_AI_IMPORT =
  /import\s*\{[^}]*\b(?:generateText|generateObject|streamText|streamObject)\b[^}]*\}\s*from\s*['"]ai['"]/gu;
const RAW_GATEWAY_IMPORT = /from\s*['"]@ai-sdk\/gateway['"]/gu;
const RAW_GATEWAY_URL = /ai-gateway\.vercel\.sh/gu;

export function scannable(path) {
  return SCANNED.test(path) && !SKIPPED.test(path);
}

export function countIn(text) {
  return [RAW_AI_IMPORT, RAW_GATEWAY_IMPORT, RAW_GATEWAY_URL].reduce(
    (sum, pattern) => sum + (text.match(pattern) ?? []).length,
    0
  );
}

export function scan(root, files) {
  const counts = {};
  for (const file of files) {
    if (!scannable(file)) continue;
    let text;
    try {
      text = readFileSync(join(root, file), 'utf8');
    } catch {
      continue;
    }
    const n = countIn(text);
    if (n) counts[file] = n;
  }
  return counts;
}

export function violations(counts, ratchet) {
  return Object.entries(counts)
    .filter(([file, n]) => n > (ratchet[file] ?? 0))
    .map(([file, n]) => ({ file, found: n, allowed: ratchet[file] ?? 0 }));
}

export function tighten(counts, ratchet) {
  const next = {};
  for (const [file, allowed] of Object.entries(ratchet)) {
    const n = counts[file] ?? 0;
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
  const path = join(cwd, RATCHET_PATH);
  const counts = scan(cwd, trackedFiles(cwd));
  const save = entries =>
    writeFileSync(
      path,
      `${JSON.stringify({ schema: RATCHET_SCHEMA, entries }, null, 2)}\n`
    );
  if (argv.includes('--bootstrap')) {
    if (existsSync(path)) {
      console.error('ai-call-guard: ratchet exists; use --write to tighten it');
      return 1;
    }
    save(Object.fromEntries(Object.entries(counts).sort()));
    return 0;
  }
  const ratchet = existsSync(path)
    ? JSON.parse(readFileSync(path, 'utf8')).entries
    : {};
  if (argv.includes('--write')) {
    save(tighten(counts, ratchet));
    return 0;
  }
  const bad = violations(counts, ratchet);
  if (bad.length) {
    console.error(
      'ai-call-guard: raw model call outside apps/web/lib/ai/sdk.ts:'
    );
    for (const v of bad)
      console.error(`  ${v.file}: ${v.found} found, ${v.allowed} allowed`);
    console.error(
      "Import generateText/streamText/generateObject/gateway from '@/lib/ai/sdk' and set experimental_telemetry.functionId so the call is tagged in Gateway cost reports."
    );
    return 1;
  }
  const slack = Object.entries(ratchet).filter(
    ([f, n]) => (counts[f] ?? 0) < n
  ).length;
  if (slack)
    console.log(
      `ai-call-guard: ok; ${slack} grandfathered file(s) can shrink (run --write)`
    );
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href)
  process.exit(main());
