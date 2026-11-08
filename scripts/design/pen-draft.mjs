#!/usr/bin/env node
/**
 * Draft missing Golden Path Pen frames from the briefs in
 * docs/design-system/pen-briefs, design first (Tim, 2026-11-08).
 *
 * Starts from the canonical workspace (PEN_GOLDEN_PATH_FILE_URL) so drafts
 * reuse its type, spacing and components, then asks the Pen agent to add one
 * frame per brief. Drafts are review material: nothing is written back to the
 * canonical file, and nothing is approved in pen-bindings.json.
 *
 * Without PEN_CLI_KEY or the file URL it drafts nothing and says so in
 * receipt.json, so a missing secret reads as blocked, never as done.
 *
 *   node scripts/design/pen-draft.mjs --out DIR [--only claim,homepage]
 */
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

export const PEN_CLI_VERSION = '0.3.14';
export const BRIEFS_DIR = 'docs/design-system/pen-briefs';

/** Split a brief into its front matter (frame, route) and prompt body. */
export function parseBrief(source, file = 'brief') {
  const m = source.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error(`${file}: missing front matter`);
  const meta = Object.fromEntries(
    m[1].split('\n').map(line => {
      const i = line.indexOf(':');
      return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
    })
  );
  if (!meta.frame || !/^[a-z0-9-]+$/.test(meta.frame))
    throw new Error(`${file}: frame must be lowercase kebab-case`);
  const prompt = m[2].trim();
  if (!prompt) throw new Error(`${file}: empty brief`);
  return { frame: meta.frame, route: meta.route ?? null, prompt };
}

export function loadBriefs(dir = BRIEFS_DIR, only = null) {
  return readdirSync(dir)
    .filter(f => f.endsWith('.md'))
    .sort()
    .map(f => parseBrief(readFileSync(join(dir, f), 'utf8'), f))
    .filter(b => !only || only.includes(b.frame));
}

/** The pen arguments for one brief, drafting into its own output file. */
export function penArgs(brief, { input, outDir }) {
  return [
    '-y',
    `@pen.dev/cli@${PEN_CLI_VERSION}`,
    ...(input ? ['--in', input] : []),
    '--out',
    join(outDir, `${brief.frame}.pen`),
    '--prompt',
    `Add a new top-level frame named "${brief.frame}" (route ${brief.route ?? 'n/a'}). Leave every existing frame untouched.\n\n${brief.prompt}`,
    '--agent',
    'claude',
    '--export',
    join(outDir, `${brief.frame}.png`),
    '--usage',
    join(outDir, `${brief.frame}.usage.json`),
    '--max-failed-calls',
    '8',
  ];
}

export function missingSecrets(env) {
  return ['PEN_CLI_KEY', 'PEN_GOLDEN_PATH_FILE_URL'].filter(k => !env[k]);
}

/** The CI annotation for a blocked run: names the missing secrets. */
export function blockedAnnotation(missing) {
  return `::error title=pen-draft blocked::pen-draft: blocked, missing ${missing.join(' and ')}`;
}

// As in scripts/agent/pen-par: without it Node can fail to fetch fonts under
// load, so text renders blank and frames reflow.
export const PEN_NODE_OPTIONS = [
  process.env.NODE_OPTIONS,
  '--network-family-autoselection-attempt-timeout=2000',
]
  .filter(Boolean)
  .join(' ');

/** A frame counts as drafted only when pen wrote both its file and preview. */
export function missingOutputs(brief, outDir, exists = existsSync) {
  return [`${brief.frame}.pen`, `${brief.frame}.png`].filter(
    f => !exists(join(outDir, f))
  );
}

const readJsonFile = path => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
};

/**
 * Why a draft doesn't count, or null when it does: the output must parse and
 * gain a top-level frame named for the brief that the input didn't have. A
 * save that exits 0 with nothing added is not a draft.
 */
export function draftProblem(before, after, frame) {
  if (!Array.isArray(after?.children)) return 'pen output is not a Pen file';
  const named = doc =>
    (doc?.children ?? []).filter(n => n?.name === frame).length;
  if (named(after) <= named(before)) return `no new top-level frame ${frame}`;
  return null;
}

async function main() {
  const { values } = parseArgs({
    options: { out: { type: 'string' }, only: { type: 'string' } },
  });
  if (!values.out) throw new Error('--out DIR is required');
  const outDir = values.out;
  mkdirSync(outDir, { recursive: true });
  const only = values.only
    ?.split(',')
    .map(f => f.trim())
    .filter(Boolean);
  const briefs = loadBriefs(BRIEFS_DIR, only?.length ? only : null);
  if (!briefs.length)
    throw new Error(`no brief matches --only ${values.only ?? ''}`);
  // A typo in a list of frames must not pass as a smaller, complete run.
  const unknown = (only ?? []).filter(f => !briefs.some(b => b.frame === f));
  if (unknown.length)
    throw new Error(`no brief for --only ${unknown.join(', ')}`);
  const receipt = {
    schema: 'jovie.pen-draft/v1',
    at: new Date().toISOString(),
    drafts: [],
  };
  const write = () =>
    writeFileSync(
      join(outDir, 'receipt.json'),
      `${JSON.stringify(receipt, null, 2)}\n`
    );

  const missing = missingSecrets(process.env);
  if (missing.length) {
    receipt.blocked = `missing ${missing.join(' and ')}`;
    write();
    console.log(`pen-draft: blocked, ${receipt.blocked}`);
    // The blocked reason must also reach the check-run annotation: the job
    // log is admin-gated, so without this a blocked run reads as a bare
    // exit 1 and triage cannot tell a missing secret from a real failure
    // (same annotation convention as scripts/ci-fast-lanes.mjs).
    if (process.env.GITHUB_ACTIONS === 'true')
      console.log(blockedAnnotation(missing));
    process.exitCode = 1;
    return;
  }

  const input = join(outDir, 'canonical.pen');
  const res = await fetch(process.env.PEN_GOLDEN_PATH_FILE_URL);
  if (!res.ok) throw new Error(`canonical Pen file: HTTP ${res.status}`);
  writeFileSync(input, Buffer.from(await res.arrayBuffer()));

  for (const brief of briefs) {
    const row = { frame: brief.frame, route: brief.route };
    try {
      execFileSync('npx', penArgs(brief, { input, outDir }), {
        stdio: ['ignore', 'inherit', 'inherit'],
        timeout: 15 * 60_000,
        env: { ...process.env, NODE_OPTIONS: PEN_NODE_OPTIONS },
      });
      const missing = missingOutputs(brief, outDir);
      const problem = missing.length
        ? `pen wrote no ${missing.join(' or ')}`
        : draftProblem(
            readJsonFile(input),
            readJsonFile(join(outDir, `${brief.frame}.pen`)),
            brief.frame
          );
      row.status = problem ? 'failed' : 'drafted';
      if (problem) row.error = problem;
    } catch (e) {
      row.status = 'failed';
      row.error = String(e.message || e)
        .split('\n')[0]
        .slice(0, 200);
    }
    receipt.drafts.push(row);
    write();
  }
  const drafted = receipt.drafts.filter(d => d.status === 'drafted').length;
  console.log(`pen-draft: ${drafted} of ${briefs.length} frames drafted`);
  if (drafted < briefs.length) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
