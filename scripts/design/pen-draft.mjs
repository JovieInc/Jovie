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
 *   node scripts/design/pen-draft.mjs --plan [--changed FILE] [--only ...]
 *
 * With PEN_DRAFT_TRIM=1 a draft starts from a cut-down copy of the canonical
 * file (components, related screens, variables) and the new frame is spliced
 * back into the full file. It is off by default: it did not stop the Pen
 * editor's "Timeout waiting for document" on Nov 8.
 *
 * --plan prints the frames a run should draft as a JSON array. CI drafts
 * each one in its own job, because ten briefs at up to 15 minutes each
 * outran the 75-minute job on Nov 8 and lost every draft to the timeout.
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
export const PEN_MAX_FAILED_CALLS = 30;
export const BRIEFS_DIR = 'docs/design-system/pen-briefs';
export const MANIFEST = 'docs/pen-stills/golden-path/manifest.json';

/**
 * Split a brief into its front matter (frame, route, and context: the
 * comma-separated names of existing screens it builds on) and prompt body.
 */
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
  const context = (meta.context ?? '')
    .split(',')
    .map(t => t.trim())
    .filter(Boolean);
  return { frame: meta.frame, route: meta.route ?? null, context, prompt };
}

export function loadBriefs(dir = BRIEFS_DIR, only = null) {
  return readdirSync(dir)
    .filter(f => f.endsWith('.md'))
    .sort()
    .map(f => ({
      ...parseBrief(readFileSync(join(dir, f), 'utf8'), f),
      file: f,
    }))
    .filter(b => !only || only.includes(b.frame));
}

// The canonical document is about 25 MB, so the editor takes a minute or two
// to load it and early canvas calls time out. With 8 allowed failures the
// agent gave up on 3 of 4 briefs before the editor was ready (run 42457693051).
export const LOAD_NOTE =
  'The document is large and the editor can take a few minutes to load it. Work in the open editor (leave the file path empty), and when a canvas call times out, wait and retry it rather than giving up.';
/** Attempts per brief: a second try starts with the editor cache warm. */
export const ATTEMPTS = 2;
// Each matrix job has 25 minutes; reserve five for setup and uploading.
export const BUDGET_MS = 20 * 60_000;
const ATTEMPT_MS = 15 * 60_000;
const MIN_ATTEMPT_MS = 5 * 60_000;

/** How long the next attempt may run, or 0 when the budget can't fit one. */
export function attemptTimeout(elapsedMs, budgetMs = BUDGET_MS, attempt = 1) {
  const left = budgetMs - elapsedMs;
  // Reserve a retry plus one minute for process teardown/startup. Giving the
  // first attempt all 15 minutes left <5 minutes after even 1 ms of overhead.
  const reserve = MIN_ATTEMPT_MS + 60_000;
  const retry = attempt < ATTEMPTS && left >= MIN_ATTEMPT_MS + reserve;
  return left < MIN_ATTEMPT_MS
    ? 0
    : Math.min(ATTEMPT_MS, left - (retry ? reserve : 0));
}

/** Files whose change means every frame has to be drafted again. */
export const DRAFTER_FILES = [
  'scripts/design/pen-draft.mjs',
  '.github/workflows/pen-draft.yml',
];

/**
 * The frames a run drafts. A push drafts only the briefs it changed, so
 * editing one brief doesn't redraw (and pay for) all of them; a change to
 * the drafter itself, or no list of changed files, drafts every brief.
 */
export function planFrames({ briefs, changed = null, only = null }) {
  if (only?.length) {
    const unknown = only.filter(f => !briefs.some(b => b.frame === f));
    if (unknown.length)
      throw new Error(`no brief for --only ${unknown.join(', ')}`);
    return briefs.filter(b => only.includes(b.frame)).map(b => b.frame);
  }
  if (!changed || changed.some(p => DRAFTER_FILES.includes(p)))
    return briefs.map(b => b.frame);
  const edited = new Set(
    changed
      .filter(p => dirname(p) === BRIEFS_DIR && p.endsWith('.md'))
      .map(p => basename(p))
  );
  return briefs.filter(b => edited.has(b.file)).map(b => b.frame);
}

/** The pen arguments for one brief, drafting into its own output file. */
export function penArgs(brief, { input, outDir, trim = false }) {
  return [
    '-y',
    `@pen.dev/cli@${PEN_CLI_VERSION}`,
    ...(input ? ['--in', input] : []),
    '--out',
    join(outDir, `${brief.frame}.pen`),
    '--prompt',
    `Add a new top-level frame named "${brief.frame}" (route ${brief.route ?? 'n/a'}). Leave every existing frame untouched.${trim ? " This file holds the design system's components and the screens this frame builds on, not every screen." : ''}\n\n${LOAD_NOTE}\n\n${brief.prompt}`,
    '--agent',
    'claude',
    '--export',
    join(outDir, `${brief.frame}.png`),
    '--usage',
    join(outDir, `${brief.frame}.usage.json`),
    // The agent only sees why a Pen call failed with --verbose-mcp; without
    // it, 3 of 4 drafts on Nov 8 hit the failure cap retrying blind, and the
    // one that finished needed 7 failed calls on this large file.
    '--verbose-mcp',
    '--max-failed-calls',
    String(PEN_MAX_FAILED_CALLS),
  ];
}

/** The cut-down input is opt-in, with PEN_DRAFT_TRIM=1. */
export function useTrimmedInput(env) {
  return env.PEN_DRAFT_TRIM === '1';
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

/** Each top-level frame's index, keyed by every node id inside it. */
function topLevelIndex(doc) {
  const index = new Map();
  doc.children.forEach((top, i) => {
    const walk = node => {
      if (node?.id) index.set(node.id, i);
      for (const child of node?.children ?? []) walk(child);
    };
    walk(top);
  });
  return index;
}

function collect(node, test, out = []) {
  if (test(node)) out.push(node);
  for (const child of node?.children ?? []) collect(child, test, out);
  return out;
}

const words = text =>
  String(text ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

/**
 * Terms that name the screens a brief builds on: its `context` list, plus
 * the longer words of its frame and route. Each term matches whole words
 * of a frame name, so "sign in" never matches "Design".
 */
export function briefTerms(brief) {
  const fromName = words(`${brief.frame} ${brief.route ?? ''}`).filter(
    w => w.length >= 4
  );
  return [
    ...new Set(
      [...fromName, ...(brief.context ?? [])].map(t => words(t).join(' '))
    ),
  ].filter(Boolean);
}

const namesTerm = (name, term) =>
  ` ${words(name).join(' ')} `.includes(` ${term} `);

/**
 * The canonical document cut down to what one brief needs: every top-level
 * frame that holds a reusable component, every frame named by one of the
 * brief's terms (see briefTerms), and every frame those reference,
 * with all variables and themes. On Nov 8, 9 of 10 drafts failed because
 * the Pen editor never finished loading the whole 25 MB file ("Timeout
 * waiting for document"), so the agent never read or drew anything.
 */
export function trimCanonical(doc, brief) {
  const index = topLevelIndex(doc);
  const terms = briefTerms(brief);
  const keep = new Set();
  doc.children.forEach((top, i) => {
    if (
      terms.some(t => namesTerm(top?.name, t)) ||
      collect(top, n => n?.reusable === true).length
    )
      keep.add(i);
  });
  const queue = [...keep];
  while (queue.length) {
    const i = queue.pop();
    for (const ref of collect(
      doc.children[i],
      n => typeof n?.ref === 'string'
    )) {
      const j = index.get(ref.ref);
      if (j !== undefined && !keep.has(j)) {
        keep.add(j);
        queue.push(j);
      }
    }
  }
  return { ...doc, children: doc.children.filter((_, i) => keep.has(i)) };
}

/**
 * The full canonical document with the frames a draft added to its trimmed
 * copy, moved right of every existing frame so nothing overlaps, plus any
 * variables or themes the draft added. Existing frames stay as they were.
 */
export function spliceDraft(full, trimmed, drafted) {
  const had = new Set(trimmed.children.map(c => c?.id));
  const added = drafted.children.filter(c => !had.has(c?.id));
  const right = Math.max(
    0,
    ...full.children.map(c => (Number(c?.x) || 0) + (Number(c?.width) || 0))
  );
  const left = Math.min(...added.map(c => Number(c?.x) || 0));
  const shift = right + 400 - (Number.isFinite(left) ? left : 0);
  const merge = (base, extra) =>
    base || extra ? { ...(extra ?? {}), ...(base ?? {}) } : undefined;
  const out = {
    ...full,
    children: [
      ...full.children,
      ...added.map(c => ({ ...c, x: (Number(c?.x) || 0) + shift })),
    ],
  };
  const variables = merge(full.variables, drafted.variables);
  const themes = merge(full.themes, drafted.themes);
  if (variables) out.variables = variables;
  if (themes) out.themes = themes;
  return out;
}

/**
 * Write the canonical download into workDir and return the .pen to draft from.
 * The URL serves either a .pen (JSON) or a .tar.gz of the workspace folder so
 * fonts and images resolve; the archive is unpacked and its `wanted` file
 * (else its first .pen) is used. Anything else, such as an expired link's
 * HTML, is named instead of being handed to pen as a document.
 */
export function writeCanonical(bytes, workDir, wanted) {
  mkdirSync(workDir, { recursive: true });
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    const archive = join(workDir, 'workspace.tar.gz');
    writeFileSync(archive, bytes);
    execFileSync('tar', ['-xzf', archive, '-C', workDir]);
    const pens = [];
    const walk = dir => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, e.name);
        if (e.isDirectory()) walk(path);
        else if (e.name.endsWith('.pen')) pens.push(path);
      }
    };
    walk(workDir);
    const pen = pens.find(p => basename(p) === wanted) ?? pens[0];
    if (!pen) throw new Error('the canonical Pen archive holds no .pen file');
    return pen;
  }
  if (!bytes.toString('utf8', 0, 64).trimStart().startsWith('{'))
    throw new Error(
      `canonical Pen download is neither a .pen file nor a .tar.gz (${bytes.length} bytes)`
    );
  const pen = join(workDir, 'canonical.pen');
  writeFileSync(pen, bytes);
  return pen;
}

async function main() {
  const { values } = parseArgs({
    options: {
      out: { type: 'string' },
      only: { type: 'string' },
      plan: { type: 'boolean' },
      changed: { type: 'string' },
    },
  });
  if (values.plan) {
    const only = values.only
      ?.split(',')
      .map(f => f.trim())
      .filter(Boolean);
    const changed = values.changed
      ? readFileSync(values.changed, 'utf8')
          .split('\n')
          .map(l => l.trim())
          .filter(Boolean)
      : null;
    console.log(
      JSON.stringify(planFrames({ briefs: loadBriefs(), changed, only }))
    );
    return;
  }
  if (!values.out) throw new Error('--out DIR is required');
  // Absolute: pen runs from the workspace folder so its assets resolve.
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
  const wanted = JSON.parse(readFileSync(MANIFEST, 'utf8')).penFile?.name;
  // Unpacked beside outDir's drafts, not among them, so the upload carries
  // only the drafted frames.
  const input = writeCanonical(
    Buffer.from(await res.arrayBuffer()),
    join(outDir, 'workspace'),
    wanted
  );

  const canonical = readJsonFile(input);
  if (!Array.isArray(canonical?.children))
    throw new Error('the canonical Pen file is not a Pen document');
  const fullBytes = readFileSync(input).length;

  // Off by default: on Nov 8, 0 of 13 drafts from the cut-down copy drew a
  // frame, against 5 of 18 from the whole file, so the copy is opt-in.
  const trim = useTrimmedInput(process.env);

  for (const brief of briefs) {
    const startedAt = Date.now();
    const row = { frame: brief.frame, route: brief.route };
    let before = canonical;
    let from = input;
    if (trim) {
      // Beside the canonical file, so its fonts and images still resolve.
      from = join(dirname(input), `${brief.frame}.trimmed.pen`);
      before = trimCanonical(canonical, brief);
      writeFileSync(from, JSON.stringify(before));
      row.trimmed = {
        frames: before.children.length,
        of: canonical.children.length,
        bytes: readFileSync(from).length,
        ofBytes: fullBytes,
      };
      console.log(
        `pen-draft: ${brief.frame} starts from ${row.trimmed.frames} of ${row.trimmed.of} frames (${(row.trimmed.bytes / 1e6).toFixed(1)} of ${(fullBytes / 1e6).toFixed(1)} MB)`
      );
    }
    for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
      const timeout = attemptTimeout(
        Date.now() - startedAt,
        BUDGET_MS,
        attempt
      );
      if (!timeout) {
        row.status ??= 'failed';
        row.error ??= 'no time left in the job for an attempt';
        break;
      }
      row.attempts = attempt;
      delete row.error;
      try {
        execFileSync('npx', penArgs(brief, { input: from, outDir, trim }), {
          stdio: ['ignore', 'inherit', 'inherit'],
          timeout,
          // Workspace fonts and images resolve relative to the .pen file.
          cwd: dirname(input),
          env: { ...process.env, NODE_OPTIONS: PEN_NODE_OPTIONS },
        });
        const missing = missingOutputs(brief, outDir);
        const problem = missing.length
          ? `pen wrote no ${missing.join(' or ')}`
          : draftProblem(
              before,
              readJsonFile(join(outDir, `${brief.frame}.pen`)),
              brief.frame
            );
        row.status = problem ? 'failed' : 'drafted';
        if (problem) row.error = problem;
        else if (trim) {
          const out = join(outDir, `${brief.frame}.pen`);
          writeFileSync(
            out,
            JSON.stringify(spliceDraft(canonical, before, readJsonFile(out)))
          );
        }
      } catch (e) {
        row.status = 'failed';
        row.error = String(e.message || e)
          .split('\n')[0]
          .slice(0, 200);
      }
      if (row.status === 'drafted') break;
    }
    receipt.drafts.push(row);
    write();
  }
  const drafted = receipt.drafts.filter(d => d.status === 'drafted').length;
  console.log(`pen-draft: ${drafted} of ${briefs.length} frames drafted`);
  if (drafted < briefs.length) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
