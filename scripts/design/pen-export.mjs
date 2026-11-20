#!/usr/bin/env node
/**
 * Approved-frame export for the Pen-to-code pipeline. Runs on the Mac that
 * has the .pen file and the Pen CLI. READ-ONLY on .pen files: the CLI opens a
 * scratch copy, never the source.
 *
 *   pnpm design:pen-export --route / --file <path.pen> \
 *       --section hero=1440:<nodeId>,390:<nodeId> --section proof=1440:<id>,390:<id>
 *   pnpm design:pen-export approve --route / --by tim --receipt <url|id> [--at <iso>]
 *
 * export  writes docs/pen-stills/<slug>/<viewport>/<section>.png, hashes each,
 *         and updates docs/design-system/pen-bindings.json. Changing any still
 *         clears the route's `approved` receipt: new pixels need new approval.
 * approve records approved {by, at, receipt}. The receipt is Tim's taste
 *         receipt, passed in. The tool never invents one and refuses to run
 *         unless every still is present and matches its hash.
 *
 * A bare `--section hero=<nodeId>` means the 1440 frame only. Add
 * `--loop <id>` to append `export` / `approved` rows to the stage ledger.
 */
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendRow } from './design-loop-ledger.mjs';
import {
  BINDINGS_PATH,
  loadBindings,
  REPO_ROOT,
  routeState,
  sha256File,
  stillPathFor,
  VIEWPORTS,
  validateBindings,
} from './pen-bindings-lib.mjs';

export const MAX_STILL_BYTES = 1_500_000;
const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

/** `hero=1440:ID,390:ID2` or `hero=ID` (1440 only) -> {section, frames:[{viewport,nodeId}]} */
export function parseSection(spec) {
  const eq = spec.indexOf('=');
  if (eq < 1)
    throw new Error(
      `--section must look like name=1440:<nodeId>,390:<nodeId> (got "${spec}")`
    );
  const section = spec.slice(0, eq);
  const frames = spec
    .slice(eq + 1)
    .split(',')
    .filter(Boolean)
    .map(part => {
      const [vp, id] = part.includes(':') ? part.split(':') : ['1440', part];
      if (!VIEWPORTS.includes(vp) || !id)
        throw new Error(
          `bad frame "${part}" in --section ${section} (viewport must be 1440 or 390)`
        );
      return { viewport: vp, nodeId: id };
    });
  if (!frames.length) throw new Error(`--section ${section} has no node ids`);
  return { section, frames };
}

export function pngWidth(buf) {
  if (buf.length < 24 || !buf.subarray(0, 8).equals(PNG_SIGNATURE))
    throw new Error('not a PNG');
  return buf.readUInt32BE(16);
}

/**
 * Real exporter (scale 1, so pixel width equals the viewport; Pen defaults to 2): headless `pen interactive` on a scratch COPY of the .pen file.
 * `pen` exits 0 even when an export fails, so the output file is checked.
 * Raster exports of very large frames can garble and icon fonts render as "?":
 * the width and size checks below catch truncation, not glyph problems, so
 * inspect the stills before running approve.
 */
/** @param {{penFile: string, nodeId: string, viewport?: string, outPath: string}} job */
export function penCliExporter({ penFile, nodeId, outPath }) {
  const work = mkdtempSync(join(tmpdir(), 'pen-export-'));
  try {
    const copy = join(work, 'in.pen');
    copyFileSync(penFile, copy);
    const dir = join(work, 'out');
    mkdirSync(dir);
    const script = `execute({ input: ${JSON.stringify(`Export([${JSON.stringify(nodeId)}],"png",${JSON.stringify(dir)},{scale:1})`)} })\nexit()\n`;
    const run = spawnSync(
      'pen',
      ['interactive', '--in', copy, '--out', join(work, 'scratch-out.pen')],
      {
        input: script,
        encoding: 'utf8',
        timeout: 180_000,
      }
    );
    const produced = join(dir, `${nodeId}.png`);
    if (!existsSync(produced))
      throw new Error(
        `pen exported nothing for node ${nodeId} (exit ${run.status}): ${String(run.stdout).slice(-400)}${run.stderr ?? ''}`
      );
    mkdirSync(dirname(outPath), { recursive: true });
    copyFileSync(produced, outPath);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

/**
 * Serialize like Biome: two-space indent, and arrays of plain strings that fit
 * in 80 columns collapse to one line, so the file passes `biome check` after a write.
 */
export function formatBindings(doc) {
  return `${JSON.stringify(doc, null, 2).replace(
    /^( *)("[^"\n]*": )?\[\n((?: +"[^"\n]*",?\n)+) *\]/gm,
    (whole, indent, key = '', body) => {
      const items = body
        .trim()
        .split('\n')
        .map(l => l.trim().replace(/,$/, ''));
      const line = `${indent}${key}[${items.join(', ')}]`;
      return line.length <= 80 ? line : whole;
    }
  )}\n`;
}

function writeJson(file, doc) {
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, formatBindings(doc));
  renameSync(tmp, file);
}

/**
 * Export every requested frame and update the manifest.
 * `exporter({penFile, nodeId, viewport, outPath})` must write a PNG at outPath.
 */
export function exportRoute({
  root = REPO_ROOT,
  route,
  penFile,
  sections,
  exporter = penCliExporter,
  maxBytes = MAX_STILL_BYTES,
  now = () => new Date(),
}) {
  const bindingsFile = join(root, BINDINGS_PATH);
  const doc = loadBindings(root);
  const entry = doc.routes[route];
  if (!entry)
    throw new Error(
      `route ${route} is not in ${BINDINGS_PATH}; add it with sources first`
    );
  if (!sections.length) throw new Error('at least one --section is required');
  if (!penFile.endsWith('.pen')) throw new Error('--file must be a .pen file');
  if (!existsSync(penFile)) throw new Error(`pen file not found: ${penFile}`);
  const startedAt = now();

  const staged = [];
  try {
    for (const { section, frames } of sections)
      for (const { viewport, nodeId } of frames) {
        const still = stillPathFor(route, viewport, section);
        const outPath = join(root, `${still}.next`);
        mkdirSync(dirname(outPath), { recursive: true });
        exporter({ penFile, nodeId, viewport, outPath });
        if (!existsSync(outPath))
          throw new Error(`exporter wrote no file for ${section}@${viewport}`);
        const buf = readFileSync(outPath);
        const width = pngWidth(buf);
        if (width !== Number(viewport))
          throw new Error(
            `${section}@${viewport}: exported width is ${width}px, expected ${viewport}px (wrong node, or scaled)`
          );
        if (buf.length > maxBytes)
          throw new Error(
            `${section}@${viewport}: ${buf.length} bytes exceeds the ${maxBytes} byte still budget`
          );
        staged.push({
          section,
          viewport,
          nodeId,
          still,
          outPath,
          sha256: sha256File(outPath),
        });
      }
  } catch (error) {
    for (const s of staged) rmSync(s.outPath, { force: true });
    throw error;
  }

  let changed = false;
  for (const s of staged) {
    const list = (entry.viewports[s.viewport] ??= []);
    const idx = list.findIndex(f => f.section === s.section);
    const next = {
      section: s.section,
      penFile: basename(penFile),
      nodeId: s.nodeId,
      still: s.still,
      sha256: s.sha256,
    };
    if (idx >= 0 && JSON.stringify(list[idx]) === JSON.stringify(next)) {
      rmSync(s.outPath, { force: true });
      continue;
    }
    changed = true;
    if (idx >= 0) list[idx] = next;
    else list.push(next);
    renameSync(s.outPath, join(root, s.still));
  }
  for (const list of Object.values(entry.viewports))
    list.sort((a, b) => a.section.localeCompare(b.section));
  const clearedApproval = changed && Boolean(entry.approved);
  if (clearedApproval) {
    delete entry.approved;
    entry.enforce = false;
  }

  const errors = validateBindings(doc, { root: null });
  if (errors.length)
    throw new Error(`manifest would be invalid:\n${errors.join('\n')}`);
  writeJson(bindingsFile, doc);
  return {
    route,
    exported: staged.length,
    changed,
    clearedApproval,
    startedAt,
    finishedAt: now(),
    state: routeState(entry),
  };
}

/**
 * Record Tim's taste receipt and turn enforcement on. Never invents a receipt.
 * @param {{root?: string, route: string, by?: any, receipt?: any, at?: string}} input
 */
export function approveRoute({
  root = REPO_ROOT,
  route,
  by,
  receipt,
  at = new Date().toISOString(),
}) {
  if (!by || by === true) throw new Error('--by is required (who approved)');
  if (!receipt || receipt === true)
    throw new Error(
      '--receipt is required: a URL or id proving the approval; the tool never invents one'
    );
  if (Number.isNaN(Date.parse(at)))
    throw new Error('--at must be an ISO timestamp');
  const doc = loadBindings(root);
  const entry = doc.routes[route];
  if (!entry) throw new Error(`route ${route} is not in ${BINDINGS_PATH}`);
  for (const vp of VIEWPORTS)
    if (!entry.viewports[vp]?.length)
      throw new Error(
        `route ${route} has no ${vp} stills; export both viewports first`
      );
  entry.enforce = true;
  entry.approved = {
    by,
    at: new Date(at).toISOString(),
    receipt: String(receipt),
  };
  const errors = validateBindings(doc, { root: null });
  for (const frame of Object.values(entry.viewports).flat()) {
    const abs = join(root, frame.still);
    if (!existsSync(abs)) errors.push(`${frame.still} is missing`);
    else if (sha256File(abs) !== frame.sha256)
      errors.push(
        `${frame.still} does not match its recorded sha256; re-export before approving`
      );
  }
  if (errors.length) throw new Error(`cannot approve:\n${errors.join('\n')}`);
  writeJson(join(root, BINDINGS_PATH), doc);
  return { route, approved: entry.approved, enforce: true };
}

function parseArgs(argv) {
  const args = { section: [] };
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    const val =
      argv[i + 1] === undefined || argv[i + 1].startsWith('--')
        ? true
        : argv[++i];
    if (key === 'section') args.section.push(String(val));
    else args[key] = val;
  }
  return args;
}

export function main(
  argv = process.argv.slice(2),
  {
    root = REPO_ROOT,
    exporter = penCliExporter,
    out = console.log,
    err = console.error,
  } = {}
) {
  const sub = argv[0] === 'approve' ? 'approve' : 'export';
  const a = parseArgs(sub === 'approve' ? argv.slice(1) : argv);
  const entered = a.entered && a.entered !== true ? a.entered : null;
  try {
    if (!a.route || a.route === true) throw new Error('--route is required');
    if (sub === 'approve') {
      const result = approveRoute({
        root,
        route: a.route,
        by: a.by,
        receipt: a.receipt,
        at: a.at === true ? undefined : a.at,
      });
      if (a.loop && entered)
        appendRow(
          {
            loopId: a.loop,
            stage: 'approved',
            enteredAt: entered,
            exitedAt: result.approved.at,
            actor: result.approved.by,
            outcome: 'completed',
            sourceReceipt: result.approved.receipt,
          },
          { root }
        );
      out(JSON.stringify(result));
      return 0;
    }
    if (!a.file || a.file === true)
      throw new Error('--file <path.pen> is required');
    const result = exportRoute({
      root,
      route: a.route,
      penFile: resolve(a.file),
      sections: a.section.map(parseSection),
      exporter,
    });
    if (a.loop)
      appendRow(
        {
          loopId: a.loop,
          stage: 'export',
          enteredAt: result.startedAt.toISOString(),
          exitedAt: result.finishedAt.toISOString(),
          actor: 'pen-export',
          outcome: 'advanced',
        },
        { root }
      );
    out(
      JSON.stringify({ ...result, startedAt: undefined, finishedAt: undefined })
    );
    if (result.clearedApproval)
      err(
        '[pen-export] stills changed: the previous approval was cleared. Run approve with a fresh receipt.'
      );
    return 0;
  } catch (e) {
    err(`[pen-export] ${e.message}`);
    return 1;
  }
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
)
  process.exitCode = main();
