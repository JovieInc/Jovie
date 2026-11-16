#!/usr/bin/env node
/**
 * Golden Path design-first loop, headless (Tim, 2026-11-08: "every screen of
 * golden path should have pen design first. the whole thing should be
 * automated", and Pen runs through its headless CLI, not on a Mac).
 *
 *   node scripts/invariants/pen-golden-path.mjs --out DIR [--base-url https://jov.ie]
 *
 * 1. Fetch the Pen workspace from PEN_GOLDEN_PATH_FILE_URL (a .pen file, or a
 *    .tar.gz of the workspace folder so fonts and images resolve).
 * 2. Export every designed frame in docs/pen-stills/golden-path/manifest.json
 *    with `pen interactive` (auth: PEN_CLI_KEY) into its stillPath.
 * 3. Run pen-still-diff in strict mode against production, writing
 *    DIR/receipt.json, which prod-cert reads as PROD_CERT_PEN_DIFF_RECEIPT.
 *
 * Without PEN_CLI_KEY or the file URL it exports nothing and says so, so
 * certification reports the frames as not exported rather than passing.
 * It never writes a .pen file: the headless session's --out is a throwaway.
 *
 * Export cache (JOV-12639): the export is keyed by the sha256 of the bytes it
 * downloaded, the Pen CLI version and the frame selection, never the URL (the
 * URL stays the same when the design changes). `--fetch-only` downloads,
 * fingerprints and prints `cache_key` (with --github-output) so the workflow
 * can restore DIR/png before the export step. The export step downloads and
 * fingerprints again, and only a restored set whose key file matches its own
 * key and holds every frame skips the Pen CLI; it prints the key it exported
 * under, which is the one to save. DIR/export.json says which way it went.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// 0.3.10 rejects .pen format 2.21; 0.3.14 exports it (lead session, 2026-11-08).
export const PEN_CLI_VERSION = '0.3.14';
export const MANIFEST = 'docs/pen-stills/golden-path/manifest.json';
// Bump when the export script or PNG naming changes, so old caches miss.
export const EXPORT_CACHE_SCHEMA = 1;
export const EXPORT_KEY_FILE = '.export-key';
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** Frames that have a Pen design (a real node id), in manifest order. */
export function designedFrames(manifest) {
  return (manifest.frames ?? []).filter(
    f => f.status === 'active' && !String(f.penNodeId).startsWith('pending')
  );
}

/** One `pen interactive` script: export each node to PNG, then exit. */
export function exportScript(nodeIds, outDir) {
  const ids = JSON.stringify(nodeIds).replaceAll("'", "\\'");
  return `execute({ input: 'Export(${ids}, "png", "${outDir}")' })\nexit()\n`;
}

const sha256 = (/** @type {string | Buffer} */ data) =>
  createHash('sha256').update(data).digest('hex');

/**
 * The Pen files to open and the node ids to export from each, in order.
 * @param {any} manifest @param {any[]} frames
 * @returns {{ penFile: string, nodeIds: string[] }[]}
 */
export function exportGroups(manifest, frames) {
  // A frame may name its own .pen file; the rest use manifest.penFile.
  const fileOf = f => f.penFile ?? manifest.penFile?.name;
  return [...new Set(frames.map(fileOf))].map(penFile => ({
    penFile,
    nodeIds: [
      ...new Set(
        frames.filter(f => fileOf(f) === penFile).map(f => f.penNodeId)
      ),
    ],
  }));
}

/**
 * Cache key for one export: the downloaded content, the exporter and the
 * selection. Any change to one of them is a different key.
 * @param {{ contentSha256: string, groups: { penFile: string, nodeIds: string[] }[] }} input
 */
export function exportCacheKey({ contentSha256, groups }) {
  if (!/^[0-9a-f]{64}$/u.test(contentSha256))
    throw new Error('export cache key needs the content sha256');
  const selection = sha256(JSON.stringify(groups)).slice(0, 16);
  return `pen-golden-path-export-v${EXPORT_CACHE_SCHEMA}-cli${PEN_CLI_VERSION}-sel${selection}-src${contentSha256}`;
}

/** True when DIR holds a restored export for exactly this key and frames. */
export function restoredExport(pngDir, key, frames) {
  const keyFile = join(pngDir, EXPORT_KEY_FILE);
  if (!existsSync(keyFile) || readFileSync(keyFile, 'utf8').trim() !== key)
    return false;
  return frames.every(f => findExport(pngDir, f.penNodeId) !== null);
}

/** The exported PNG for a node: Pen names files after the node id. */
export function findExport(dir, nodeId) {
  const names = existsSync(dir) ? readdirSync(dir) : [];
  const hit =
    names.find(name => name === `${nodeId}.png`) ??
    names.find(name => name.endsWith('.png') && name.includes(nodeId));
  return hit ? join(dir, hit) : null;
}

function locatePen(dir, wanted) {
  const all = [];
  const walk = d => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const path = join(d, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.pen')) all.push(path);
    }
  };
  walk(dir);
  return all.find(path => basename(path) === wanted) ?? all[0] ?? null;
}

const defaultRun = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { stdio: ['pipe', 'pipe', 'inherit'], ...opts });

/**
 * Download the Pen source into DIR/workspace and fingerprint the bytes. Every
 * call downloads again, so the key always describes what this call exports.
 * @param {{ out: string, env: NodeJS.ProcessEnv, run: typeof defaultRun, fetchImpl: typeof fetch }} options
 */
async function fetchPenSource({ out, env, run, fetchImpl }) {
  const work = join(out, 'workspace');
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  const response = await fetchImpl(env.PEN_GOLDEN_PATH_FILE_URL);
  if (!response.ok)
    throw new Error(`Pen file download: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const isArchive = bytes[0] === 0x1f && bytes[1] === 0x8b;
  const download = join(work, isArchive ? 'workspace.tar.gz' : 'src.pen');
  writeFileSync(download, bytes);
  if (isArchive) run('tar', ['-xzf', download, '-C', work]);
  return { work, download, isArchive, contentSha256: sha256(bytes) };
}

/**
 * `report` gets each workflow output as soon as it is known, so an export
 * that finished still reports itself when the diff after it throws.
 * @param {{ out: string, baseUrl?: string, env?: NodeJS.ProcessEnv, root?: string, run?: typeof defaultRun, fetchImpl?: typeof fetch, log?: (line: string) => void, fetchOnly?: boolean, report?: (name: string, value: string) => void }} options
 */
export async function runGoldenPathPen({
  out,
  baseUrl = 'https://jov.ie',
  env = process.env,
  root = REPO_ROOT,
  run = defaultRun,
  fetchImpl = fetch,
  log = line => process.stdout.write(`${line}\n`),
  fetchOnly = false,
  report = () => {},
}) {
  mkdirSync(out, { recursive: true });
  const manifest = JSON.parse(readFileSync(join(root, MANIFEST), 'utf8'));
  const frames = designedFrames(manifest);
  const undesigned = manifest.frames.filter(f => !frames.includes(f));
  for (const f of undesigned)
    log(`no Pen design: ${f.sectionId} ${f.route ?? ''}`);
  const missing = ['PEN_CLI_KEY', 'PEN_GOLDEN_PATH_FILE_URL'].filter(
    name => !env[name]
  );
  if (missing.length) {
    log(`Pen export skipped: ${missing.join(' and ')} not set`);
    return { exported: [], skipped: missing, undesigned: undesigned.length };
  }

  const { work, download, isArchive, contentSha256 } = await fetchPenSource({
    out,
    env,
    run,
    fetchImpl,
  });
  const groups = exportGroups(manifest, frames);
  const cacheKey = exportCacheKey({ contentSha256, groups });
  log(`Pen source sha256 ${contentSha256}; export cache key ${cacheKey}`);
  report('cache_key', cacheKey);
  if (fetchOnly)
    return {
      exported: [],
      skipped: [],
      undesigned: undesigned.length,
      cacheKey,
    };
  const pngDir = join(out, 'png');
  const fromCache = restoredExport(pngDir, cacheKey, frames);
  if (fromCache) {
    log('Pen export restored from the content-keyed cache; Pen CLI not run');
  } else {
    rmSync(pngDir, { recursive: true, force: true });
    mkdirSync(pngDir, { recursive: true });
  }
  for (const { penFile: name, nodeIds: ids } of fromCache ? [] : groups) {
    const pen = isArchive ? locatePen(work, name) : download;
    if (!pen) throw new Error('the Pen download holds no .pen file');
    const throwaway = join(out, 'throwaway.pen');
    run(
      'npx',
      [
        '-y',
        `@pen.dev/cli@${PEN_CLI_VERSION}`,
        'interactive',
        '--in',
        pen,
        '--out',
        throwaway,
      ],
      { cwd: dirname(pen), input: exportScript(ids, pngDir), env }
    );
    rmSync(throwaway, { force: true });
  }

  const exported = [];
  for (const frame of frames) {
    const png = findExport(pngDir, frame.penNodeId);
    // Export can print an error and still exit 0: a missing file is a fail.
    if (!png) {
      log(`Pen export missing: ${frame.sectionId} node ${frame.penNodeId}`);
      continue;
    }
    const target = join(root, frame.stillPath);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(png, target);
    const sha = createHash('sha256').update(readFileSync(target)).digest('hex');
    exported.push({ sectionId: frame.sectionId, sha256: sha });
  }
  log(`Pen exported ${exported.length}/${frames.length} designed frames`);
  // Only a complete fresh export is worth caching; a partial one re-exports.
  const cacheable = !fromCache && exported.length === frames.length;
  if (cacheable) writeFileSync(join(pngDir, EXPORT_KEY_FILE), `${cacheKey}\n`);
  writeFileSync(
    join(out, 'export.json'),
    `${JSON.stringify({ source: fromCache ? 'cache' : 'pen-cli', cacheKey, contentSha256, exported }, null, 2)}\n`
  );
  report('export_source', fromCache ? 'cache' : 'pen-cli');
  report('export_cacheable', String(cacheable));
  if (exported.length) {
    // pen-still-diff captures production with Playwright's Chromium.
    run('pnpm', ['exec', 'playwright', 'install', '--with-deps', 'chromium'], {
      cwd: root,
      stdio: 'inherit',
    });
    run(
      'node',
      [
        'scripts/invariants/pen-still-diff.mjs',
        '--manifest',
        MANIFEST,
        '--out',
        out,
        '--base-url',
        baseUrl,
        '--strict',
      ],
      { cwd: root, stdio: 'inherit' }
    );
  }
  return {
    exported,
    skipped: [],
    undesigned: undesigned.length,
    cacheKey,
    exportSource: fromCache ? 'cache' : 'pen-cli',
    cacheable,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const arg = name => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const out = arg('out');
  if (!out) {
    process.stderr.write(
      'usage: pen-golden-path.mjs --out DIR [--base-url URL] [--fetch-only] [--github-output FILE]\n'
    );
    process.exit(64);
  }
  const githubOutput = arg('github-output');
  try {
    await runGoldenPathPen({
      out: resolve(out),
      baseUrl: arg('base-url'),
      fetchOnly: argv.includes('--fetch-only'),
      report: (name, value) => {
        if (githubOutput) appendFileSync(githubOutput, `${name}=${value}\n`);
      },
    });
  } catch (error) {
    process.stderr.write(`${error?.message ?? error}\n`);
    // With --record, a diff that wrote its receipt exits 0: certification
    // reads that receipt and fails the surface, so the verdict is not lost.
    const recorded = existsSync(join(resolve(out), 'receipt.json'));
    process.exit(argv.includes('--record') && recorded ? 0 : 1);
  }
}
