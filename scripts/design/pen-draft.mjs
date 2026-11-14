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
 * The Pen agent runs on Fable 5.2; PEN_DRAFT_MODEL names another model.
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
import { spliceDraft, trimCanonical } from './pen-trim.mjs';

export { briefTerms, spliceDraft, trimCanonical } from './pen-trim.mjs';

// 0.3.16 is the first Pen CLI that lists claude-fable-5-2; older ones reject
// it as an unknown model.
export const PEN_CLI_VERSION = '0.3.16';
// The CLI's own default is claude-opus-5-5, whose weekly limit on the
// subscription was spent on Nov 12: every frame of run 43305192409 ended
// "Agent failed: rate_limit". Fable 5.2 has its own limit (Tim, 2026-11-12).
export const PEN_DRAFT_MODEL = 'claude-fable-5-2';
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
// A build call ran past ten minutes once the agent set out to draw four rail
// states (run 43339513257), and pen only saves when the agent finishes.
export const LOAD_NOTE =
  'The document is large and the editor can take a few minutes to load it. Work in the open editor (leave the file path empty), and when a canvas call times out, wait and retry it rather than giving up. Build in small steps, one screen or state per call: a call that builds several at once can run for many minutes on this file, and a call that times out wrote nothing — do not read the image it was going to write, just redraw that piece in a smaller call. Saving takes two minutes and the run is stopped at 55, so anything not finished within 50 minutes saves nothing: finish as soon as the frame matches the brief.';
/** Attempts per brief: a draft that failed early gets one more try. */
export const ATTEMPTS = 2;
// Each matrix job has 60 minutes. Setup and upload took 20 seconds in run
// 43339513257, so five minutes are reserved. Finished drafts of the small
// briefs have taken 7 to 13 minutes, but run 43568417528 stopped the insights
// and page-skeletons briefs (4 and 12 frames to draw) with most of their
// frames still to build at 23 minutes: the budget has to fit the largest
// brief, not the typical one.
export const BUDGET_MS = 55 * 60_000;
// A retry starts from the canonical file again, so less than this is no use.
const MIN_ATTEMPT_MS = 10 * 60_000;

/**
 * How long the next attempt may run, or 0 when the budget can't fit one. The
 * first attempt gets the whole budget, so one that runs it out is not
 * restarted; one that fails early leaves room for a second.
 */
export function attemptTimeout(elapsedMs, budgetMs = BUDGET_MS) {
  const left = budgetMs - elapsedMs;
  return left < MIN_ATTEMPT_MS ? 0 : left;
}

/** Files whose change means every frame has to be drafted again. */
export const DRAFTER_FILES = [
  'scripts/design/pen-draft.mjs',
  'scripts/design/pen-trim.mjs',
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
export function penArgs(
  brief,
  { input, outDir, trim = false, model = PEN_DRAFT_MODEL }
) {
  return [
    '-y',
    `@pen.dev/cli@${PEN_CLI_VERSION}`,
    ...(input ? ['--in', input] : []),
    '--out',
    join(outDir, `${brief.frame}.pen`),
    '--prompt',
    `Add a new top-level frame named "${brief.frame}" (route ${brief.route ?? 'n/a'}). Leave every existing frame untouched.${trim ? " This file holds the design system's components and the screens this frame builds on, not every screen." : ''}\n\n${LOAD_NOTE}\n\n${brief.prompt}`,
    // Used only if --model is ever dropped; the CLI infers the agent from
    // the model id.
    '--agent',
    'claude',
    '--model',
    model,
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

/** The model the Pen agent runs on: PEN_DRAFT_MODEL, else Fable 5.2. */
export function penModel(env) {
  return env.PEN_DRAFT_MODEL?.trim() || PEN_DRAFT_MODEL;
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
  const model = penModel(process.env);
  console.log(`pen-draft: the Pen agent runs on ${model}`);

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
      const timeout = attemptTimeout(Date.now() - startedAt);
      if (!timeout) {
        // Keep the first attempt's own error: it says why there's no draft.
        row.status ??= 'failed';
        row.error ??= 'no time left in the job for an attempt';
        break;
      }
      row.attempts = attempt;
      delete row.error;
      try {
        execFileSync(
          'npx',
          penArgs(brief, { input: from, outDir, trim, model }),
          {
            stdio: ['ignore', 'inherit', 'inherit'],
            timeout,
            // Workspace fonts and images resolve relative to the .pen file.
            cwd: dirname(input),
            env: { ...process.env, NODE_OPTIONS: PEN_NODE_OPTIONS },
          }
        );
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
