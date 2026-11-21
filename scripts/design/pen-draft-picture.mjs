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
import { decodePng } from '../invariants/pen-still-diff-lib.mjs';
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

/**
 * The see-through share a frame may have outside the gutters between its
 * variants: their rounded outer corners.
 */
export const MAX_CLEAR_SHARE = 0.02;

/** Past this share the picture is mostly empty, gutters or not. */
const MAX_GUTTER_SHARE = 0.5;

/**
 * Why a picture must not go to review, or null. A frame or section with no
 * background fill reaches review as a checkerboard where the surface or
 * gradient should be (Tim, 2026-11-15: "gradient bgs dont render"; the
 * canonical "Section / What's new" has no fill at all). Pen bakes that
 * checkerboard into the export as opaque pixels, so the alpha channel alone
 * misses it; the clear gutters Pen leaves between a frame's variants are
 * fine and are not counted.
 * @param {Buffer} png
 */
export function pictureProblem(png) {
  let img;
  try {
    img = decodePng(png);
  } catch (error) {
    return `pen exported a picture that is not a readable PNG (${firstLine(error)})`;
  }
  const { width, height, data } = img;
  const pixels = width * height;
  if (!pixels) return 'pen exported an empty picture';
  const clearAt = (x, y) => data[(y * width + x) * 4 + 3] < 250;
  const clearRow = new Uint8Array(height);
  const clearCol = new Uint8Array(width).fill(1);
  for (let y = 0; y < height; y++) {
    let all = 1;
    for (let x = 0; x < width; x++) {
      if (clearAt(x, y)) continue;
      all = 0;
      clearCol[x] = 0;
    }
    clearRow[y] = all;
  }
  let clear = 0;
  let loose = 0;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (clearAt(x, y)) {
        clear++;
        if (!clearRow[y] && !clearCol[x]) loose++;
      }
  const share = Math.max(
    loose / pixels,
    clear / pixels > MAX_GUTTER_SHARE ? clear / pixels : 0
  );
  if (share > MAX_CLEAR_SHARE)
    return `the frame has no background: ${Math.round(share * 100)}% of the picture is see-through`;
  const checker = findCheckerboard(img);
  return checker
    ? `the frame shows a see-through checkerboard near x ${checker.x}, y ${checker.y}: a section there has no fill`
    : null;
}

/** Tiles of a baked transparency checkerboard: a few pixels each. */
const TILE = { min: 3, max: 16 };
/** Alternating tiles in one row before it counts as a checkerboard. */
const MIN_TILES = 6;
/** Rows that must show it, so one striped line never fails a frame. */
const MIN_CHECKER_ROWS = 3;

/**
 * Where a picture shows a transparency checkerboard, or null: a run of
 * equal tiles alternating between two levels, with the levels swapped one
 * tile further down.
 * @param {{width: number, height: number, data: Uint8Array}} img
 */
export function findCheckerboard({ width, height, data }) {
  const level = (x, y) => {
    const i = (y * width + x) * 4;
    if (data[i + 3] < 250) return -1;
    return ((data[i] * 3 + data[i + 1] * 6 + data[i + 2]) / 10) | 0;
  };
  const near = (a, b) => a >= 0 && b >= 0 && Math.abs(a - b) <= 2;
  let first = null;
  let rows = 0;
  for (let y = 0; y < height; y += 2) {
    const runs = [];
    for (let x = 0; x < width; ) {
      const v = level(x, y);
      let end = x + 1;
      while (end < width && near(level(end, y), v)) end++;
      runs.push({ x, w: end - x, v });
      x = end;
    }
    let found = false;
    for (let i = 0; i + MIN_TILES <= runs.length && !found; i++) {
      const t = runs[i].w;
      const a = runs[i].v;
      const b = runs[i + 1].v;
      if (t < TILE.min || t > TILE.max || a < 0 || b < 0) continue;
      if (Math.abs(a - b) < 8) continue;
      let j = i;
      while (
        j < runs.length &&
        Math.abs(runs[j].w - t) <= 1 &&
        near(runs[j].v, (j - i) % 2 ? b : a)
      )
        j++;
      if (j - i < MIN_TILES || y + t >= height) continue;
      let swapped = 0;
      for (let k = i; k < j; k++) {
        const mid = runs[k].x + (runs[k].w >> 1);
        if (near(level(mid, y + t), (k - i) % 2 ? a : b)) swapped++;
      }
      if (swapped >= j - i - 1) {
        found = true;
        first ??= { x: runs[i].x, y };
      }
    }
    if (found && ++rows >= MIN_CHECKER_ROWS) return first;
  }
  return null;
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
    const problem = pictureProblem(readFileSync(join(pngDir, png)));
    if (problem) throw new Error(problem);
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
