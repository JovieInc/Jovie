#!/usr/bin/env node
/**
 * Render each Pen draft's own frame to a picture a person can read.
 *
 * The png a draft run exports is the whole canonical canvas, about 8192x7900
 * with hundreds of tiny frames (run 43568417528), so Tim cannot approve from
 * it. Each draft's `<frame>.pen` holds the new top-level frame, though. This
 * opens that file headless, the way pen-inspect.mjs does, and exports only
 * that frame's node:
 *
 *   node scripts/design/pen-draft-picture.mjs --dir <downloaded artifacts>
 *   node scripts/design/pen-draft-picture.mjs --plan --dir <downloaded artifacts>
 *
 * For every `pen-draft-<frame>` folder with a `<frame>.pen` it writes
 * `<frame>.frame.png` and `<frame>.frame.json` beside it. The json says which
 * node was drawn, or why the render failed. pen-draft-publish.mjs uploads the
 * picture and fails a frame whose render failed, so this exits 0 either way.
 * It never writes a .pen file: each session's --out is a throwaway.
 *
 * --plan prints the frames that left a .pen as a JSON array. CI renders each
 * in its own job, so one frame that will not render costs only itself.
 */
import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import {
  MANIFEST,
  missingSecrets,
  PEN_CLI_VERSION,
  PEN_NODE_OPTIONS,
  writeCanonical,
} from './pen-draft.mjs';
import { frameFromArtifactName } from './pen-draft-frames.mjs';

export const PICTURE_SCHEMA = 'jovie.pen-draft-picture/v1';
export const PICTURE_PREFIX = 'PEN_DRAFT_PICTURE ';
// The editor takes a minute or two to load the 25 MB document, and Pen gives
// one execute about 55 seconds.
export const RENDER_TIMEOUT_MS = 5 * 60_000;

/**
 * @typedef {{frame: string, ok: boolean, error?: string}} RenderRow
 * @typedef {(cmd: string, args: string[], opts: {cwd: string, input: string, env: NodeJS.ProcessEnv, timeout: number}) => Buffer | string} Run
 */

/**
 * The frame a draft added: the last top-level node named for the brief, as
 * pen-draft.mjs's draftProblem counts it. Null when the file has none.
 */
export function draftedFrameNode(doc, frame) {
  const node = (Array.isArray(doc?.children) ? doc.children : [])
    .filter(child => child?.name === frame && typeof child?.id === 'string')
    .at(-1);
  return node ? { id: node.id, name: node.name } : null;
}

/**
 * Scale 1 draws a frame at its own size, so a 1440 desktop frame is 1440px
 * wide (Pen's default of 2 doubles it). A frame with a side over 3600px, such
 * as several states side by side, is shrunk to fit 3600.
 */
export function pictureScale(width, height) {
  const longest = Math.max(Number(width) || 0, Number(height) || 0);
  if (longest <= 3600) return 1;
  return Math.floor((3600 / longest) * 100) / 100;
}

/** One `execute`: measure the drafted node, say what it is, export it alone. */
export function pictureProgram(nodeId, pngDir) {
  return `{
const id = ${JSON.stringify(String(nodeId))};
const dir = ${JSON.stringify(String(pngDir))};
const pictureScale = ${pictureScale};
let seen = null;
Get(id, (n, c) => {
  if (!seen) seen = { id: n.id, name: n.name, w: Math.round(c.bounds.width), h: Math.round(c.bounds.height) };
  c.skipChildren();
});
const scale = seen ? pictureScale(seen.w, seen.h) : 1;
Print(${JSON.stringify(PICTURE_PREFIX)} + JSON.stringify({ ...seen, scale }));
Export([id], 'png', dir, { scale });
}`;
}

/** The node Pen says it drew, from the session's stdout; null when unsaid. */
export function parsePicture(stdout) {
  for (const line of String(stdout).split('\n')) {
    const at = line.indexOf(PICTURE_PREFIX);
    if (at < 0) continue;
    try {
      return JSON.parse(line.slice(at + PICTURE_PREFIX.length));
    } catch {
      return null;
    }
  }
  return null;
}

/** @type {Run} */
const defaultRun = (cmd, args, opts) =>
  execFileSync(cmd, args, {
    stdio: ['pipe', 'pipe', 'inherit'],
    maxBuffer: 64 * 1024 * 1024,
    ...opts,
  });

const firstLine = error =>
  String(error?.message ?? error)
    .split('\n')[0]
    .slice(0, 200);

/** The drafts under `dir` that left a .pen: `pen-draft-<frame>/<frame>.pen`. */
function draftPens(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => ({
      frame: frameFromArtifactName(entry.name),
      folder: join(dir, entry.name),
    }))
    .filter(
      draft =>
        draft.frame && existsSync(join(draft.folder, `${draft.frame}.pen`))
    )
    .sort((a, b) => a.frame.localeCompare(b.frame));
}

/** The frames under `dir` to render: CI gives each its own job. */
export function planFrames(dir) {
  return draftPens(dir).map(draft => draft.frame);
}

/**
 * Render one draft's frame into its folder. Throws with the reason when the
 * frame cannot be found or Pen exports nothing.
 * @param {{frame: string, folder: string, canonical: string, work: string, env: NodeJS.ProcessEnv, run: Run}} job
 */
function renderFrame({ frame, folder, canonical, work, env, run }) {
  let doc = null;
  try {
    doc = JSON.parse(readFileSync(join(folder, `${frame}.pen`), 'utf8'));
  } catch {
    // Reported below.
  }
  if (!Array.isArray(doc?.children))
    throw new Error('the draft is not a Pen file');
  const node = draftedFrameNode(doc, frame);
  if (!node) throw new Error(`the draft has no top-level frame ${frame}`);
  // Beside the canonical file, so the workspace's fonts and images resolve.
  const copy = join(dirname(canonical), `${frame}.draft.pen`);
  const pngDir = join(work, `png-${frame}`);
  const throwaway = join(work, `throwaway-${frame}.pen`);
  mkdirSync(pngDir, { recursive: true });
  copyFileSync(join(folder, `${frame}.pen`), copy);
  try {
    const stdout = String(
      run(
        'npx',
        [
          '-y',
          `@pen.dev/cli@${PEN_CLI_VERSION}`,
          'interactive',
          '--in',
          copy,
          '--out',
          throwaway,
        ],
        {
          cwd: dirname(canonical),
          input: `execute(${JSON.stringify({ input: pictureProgram(node.id, pngDir) })})\nexit()\n`,
          env: { ...env, NODE_OPTIONS: PEN_NODE_OPTIONS },
          timeout: RENDER_TIMEOUT_MS,
        }
      )
    );
    const drawn = parsePicture(stdout);
    if (drawn?.id !== node.id || drawn?.name !== frame)
      throw new Error(
        `pen drew ${drawn?.name ?? 'nothing it named'}, not ${frame}`
      );
    // `pen` exits 0 even when an export fails, so the file is checked.
    const png = readdirSync(pngDir).find(
      name => name.endsWith('.png') && name.includes(node.id)
    );
    if (!png) throw new Error(`pen exported no picture of ${frame}`);
    copyFileSync(join(pngDir, png), join(folder, `${frame}.frame.png`));
    return {
      nodes: [{ id: node.id, name: frame, width: drawn.w, height: drawn.h }],
      scale: drawn.scale,
    };
  } finally {
    rmSync(copy, { force: true });
    rmSync(throwaway, { force: true });
    rmSync(pngDir, { recursive: true, force: true });
  }
}

/**
 * Render every draft under `dir`. Each gets a `<frame>.frame.json`; a failed
 * one never keeps a `<frame>.frame.png`.
 * @param {{dir: string, env?: NodeJS.ProcessEnv, fetchImpl?: typeof fetch, run?: Run, log?: (line: string) => void}} options
 * @returns {Promise<RenderRow[]>}
 */
export async function renderDrafts({
  dir,
  env = process.env,
  fetchImpl = fetch,
  run = defaultRun,
  log = console.log,
}) {
  const drafts = draftPens(dir);
  if (drafts.length === 0) return [];
  const work = mkdtempSync(join(tmpdir(), 'pen-draft-picture-work-'));
  /** @type {RenderRow[]} */
  const rows = [];
  const finish = (draft, outcome) => {
    if (!outcome.ok)
      rmSync(join(draft.folder, `${draft.frame}.frame.png`), { force: true });
    writeFileSync(
      join(draft.folder, `${draft.frame}.frame.json`),
      `${JSON.stringify({ schema: PICTURE_SCHEMA, frame: draft.frame, ...outcome }, null, 2)}\n`
    );
    rows.push({
      frame: draft.frame,
      ok: outcome.ok,
      ...(outcome.ok ? {} : { error: outcome.error }),
    });
    log(
      `pen-draft-picture: ${draft.frame}: ${outcome.ok ? `drew ${outcome.nodes[0].width}x${outcome.nodes[0].height} at scale ${outcome.scale}` : `FAILED ${outcome.error}`}`
    );
  };
  try {
    let canonical = null;
    let blocked = null;
    const missing = missingSecrets(env);
    if (missing.length) blocked = `missing ${missing.join(' and ')}`;
    else {
      try {
        const response = await fetchImpl(env.PEN_GOLDEN_PATH_FILE_URL);
        if (!response.ok)
          throw new Error(`canonical Pen file: HTTP ${response.status}`);
        const wanted = JSON.parse(readFileSync(MANIFEST, 'utf8')).penFile?.name;
        canonical = writeCanonical(
          Buffer.from(await response.arrayBuffer()),
          join(work, 'workspace'),
          wanted
        );
      } catch (error) {
        // The message never carries the private file URL.
        blocked = /^canonical Pen /.test(firstLine(error))
          ? firstLine(error)
          : 'canonical Pen file could not be fetched';
      }
    }
    for (const draft of drafts) {
      if (blocked) {
        finish(draft, { ok: false, error: blocked });
        continue;
      }
      try {
        finish(draft, {
          ok: true,
          ...renderFrame({ ...draft, canonical, work, env, run }),
        });
      } catch (error) {
        finish(draft, { ok: false, error: firstLine(error) });
      }
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  return rows;
}

async function main() {
  const { values } = parseArgs({
    options: { dir: { type: 'string' }, plan: { type: 'boolean' } },
  });
  if (!values.dir)
    throw new Error('usage: pen-draft-picture.mjs [--plan] --dir <dir>');
  if (values.plan) {
    console.log(JSON.stringify(planFrames(resolve(values.dir))));
    return;
  }
  const rows = await renderDrafts({ dir: resolve(values.dir) });
  if (rows.length === 0)
    console.log('pen-draft-picture: no draft left a .pen to render');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await main();
