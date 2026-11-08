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
import { basename, dirname, join, resolve } from 'node:path';
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

/**
 * What the canonical download is. The golden-path exporter accepts a single
 * .pen or a .tar.gz of the workspace (so fonts and images resolve); a share
 * page or sign-in page comes back as HTML and Pen cannot open it.
 */
export function canonicalKind(bytes) {
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) return 'archive';
  const head = bytes.subarray(0, 512).toString('utf8').trimStart();
  if (head.startsWith('{')) return 'pen';
  if (/^<(!doctype|html|\?xml)/i.test(head)) return 'html';
  return 'unknown';
}

/** The workspace's .pen to draft from: the manifest's file, else the first. */
export function locatePen(dir, wanted, list = readdirSync) {
  const all = [];
  const walk = d => {
    for (const entry of list(d, { withFileTypes: true })) {
      const path = join(d, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.pen')) all.push(path);
    }
  };
  walk(dir);
  return all.find(path => basename(path) === wanted) ?? all[0] ?? null;
}

const CANONICAL_MANIFEST = 'docs/pen-stills/golden-path/manifest.json';

function canonicalPenName() {
  try {
    return JSON.parse(readFileSync(CANONICAL_MANIFEST, 'utf8')).penFile?.name;
  } catch {
    return undefined;
  }
}

export function missingSecrets(env) {
  return ['PEN_CLI_KEY', 'PEN_GOLDEN_PATH_FILE_URL'].filter(k => !env[k]);
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
  // Absolute, because pen runs from the canonical file's own folder.
  const outDir = resolve(values.out);
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
    process.exitCode = 1;
    return;
  }

  const res = await fetch(process.env.PEN_GOLDEN_PATH_FILE_URL);
  if (!res.ok) throw new Error(`canonical Pen file: HTTP ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  const kind = canonicalKind(bytes);
  // Name the shape, never the contents: the URL and file are private.
  console.log(
    `pen-draft: canonical download is ${kind}, ${bytes.length} bytes`
  );
  receipt.canonical = { kind, bytes: bytes.length };
  let input = join(outDir, 'canonical.pen');
  if (kind === 'archive') {
    const work = join(outDir, 'workspace');
    mkdirSync(work, { recursive: true });
    const archive = join(work, 'workspace.tar.gz');
    writeFileSync(archive, bytes);
    execFileSync('tar', ['-xzf', archive, '-C', work]);
    input = locatePen(work, canonicalPenName());
    if (!input) throw new Error('the Pen workspace archive holds no .pen file');
  } else if (kind === 'pen') {
    writeFileSync(input, bytes);
  } else {
    receipt.blocked = `PEN_GOLDEN_PATH_FILE_URL returned ${kind}, not a .pen file or workspace .tar.gz`;
    write();
    console.log(`pen-draft: blocked, ${receipt.blocked}`);
    process.exitCode = 1;
    return;
  }

  for (const brief of briefs) {
    const row = { frame: brief.frame, route: brief.route };
    try {
      execFileSync('npx', penArgs(brief, { input, outDir }), {
        stdio: ['ignore', 'inherit', 'inherit'],
        timeout: 15 * 60_000,
        // Run beside the .pen so a workspace's fonts and images resolve.
        cwd: dirname(input),
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
