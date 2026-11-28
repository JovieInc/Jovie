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
import { applyAccepted, loadAccepted } from '../design/pen-accepted.mjs';
import { validateManifest } from './pen-still-diff.mjs';

// 0.3.10 rejects .pen format 2.21; 0.3.14 exports it (lead session, 2026-11-08).
export const PEN_CLI_VERSION = '0.3.14';
export const MANIFEST = 'docs/pen-stills/golden-path/manifest.json';
export const BRIEF_DIR = 'docs/design-system/pen-briefs';
export const GOLDEN_PATH_SURFACES = Object.freeze([
  'landing',
  'signup-signin',
  'claim',
  'onboarding',
  'chat',
  'public-profile',
  'smartlink',
  'checkout',
]);
// Bump when the export script or PNG naming changes, so old caches miss.
export const EXPORT_CACHE_SCHEMA = 1;
export const EXPORT_KEY_FILE = '.export-key';
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** True when a Golden Path route redirects strangers to /signin unless authenticated. */
export function isProtectedGoldenPathRoute(route) {
  if (typeof route !== 'string') return false;
  return (
    route === '/app' ||
    route.startsWith('/app/') ||
    route === '/billing' ||
    route.startsWith('/billing/') ||
    route.startsWith('/onboarding/checkout') ||
    route === '/admin' ||
    route.startsWith('/admin/')
  );
}

/**
 * Closed-loop Golden Path manifest invariant: fails closed in preflight/CI on
 * missing routes, unmapped Golden Path surfaces, protected routes missing
 * `auth: "required"`, or `pending-*` frames missing an authored Pen brief.
 * @param {any} manifest
 * @param {{ root?: string, surfaceIds?: readonly string[] }} [options]
 */
export function validateGoldenPathManifest(
  manifest,
  { root = REPO_ROOT, surfaceIds = GOLDEN_PATH_SURFACES } = {}
) {
  const base = validateManifest(manifest);
  const errors = base.ok ? [] : [...base.errors];
  const allowedSurfaces = new Set(surfaceIds);
  const activeBySurface = new Map(surfaceIds.map(id => [id, 0]));

  for (const [index, frame] of (manifest?.frames ?? []).entries()) {
    if (!frame || typeof frame !== 'object') continue;
    const label = `frames[${index}] (${frame.sectionId ?? 'unknown'})`;
    const parts = String(frame.sectionId ?? '').split('/');
    const [surface, screen] = parts;
    if (parts.length !== 2 || !surface || !screen) {
      errors.push(`${label}: sectionId must be <surface>/<screen>`);
      continue;
    }
    if (!allowedSurfaces.has(surface)) {
      errors.push(`${label}: unknown Golden Path surface "${surface}"`);
    }
    if (frame.status !== 'active') continue;
    if (activeBySurface.has(surface)) {
      activeBySurface.set(surface, (activeBySurface.get(surface) ?? 0) + 1);
    }
    if (
      typeof frame.route !== 'string' ||
      !frame.route.startsWith('/') ||
      frame.route.includes('[')
    ) {
      errors.push(
        `${label}: active Golden Path frame must have a concrete route starting with "/"`
      );
    } else if (
      isProtectedGoldenPathRoute(frame.route) &&
      frame.auth !== 'required'
    ) {
      errors.push(
        `${label}: protected route "${frame.route}" must set auth: "required"`
      );
    }
    if (String(frame.penNodeId).startsWith('pending')) {
      const briefPath = join(root, BRIEF_DIR, `${screen}.md`);
      if (!existsSync(briefPath)) {
        errors.push(
          `${label}: pending Pen frame requires brief ${BRIEF_DIR}/${screen}.md`
        );
      }
    }
  }

  for (const surface of surfaceIds) {
    if ((activeBySurface.get(surface) ?? 0) === 0) {
      errors.push(
        `Golden Path surface "${surface}" has no active Pen frame in ${MANIFEST}`
      );
    }
  }

  if (errors.length > 0) {
    throw new Error(`Invalid Golden Path Pen manifest:\n${errors.join('\n')}`);
  }
  return manifest;
}

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
 * @param {{ out: string, env: NodeJS.ProcessEnv, run: typeof defaultRun, fetchImpl: typeof fetch, accepted?: readonly any[], penName?: string, log?: (line: string) => void }} options
 */
async function fetchPenSource({
  out,
  env,
  run,
  fetchImpl,
  accepted,
  penName,
  log,
}) {
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
  if (!accepted.length)
    return { work, download, isArchive, contentSha256: sha256(bytes) };
  // Approved drafts the canonical lacks are spliced in (pen-accepted.mjs);
  // the key covers them, so a new or changed overlay never hits old PNGs.
  const pen = isArchive ? locatePen(work, penName) : download;
  if (!pen) throw new Error('the Pen download holds no .pen file');
  const merged = applyAccepted(
    JSON.parse(readFileSync(pen, 'utf8')),
    accepted,
    log
  );
  writeFileSync(pen, JSON.stringify(merged.doc));
  log(`Pen accepted overlay: applied ${merged.applied.join(', ') || 'none'}`);
  const overlay = sha256(JSON.stringify(accepted));
  return {
    work,
    download,
    isArchive,
    contentSha256: sha256(`${sha256(bytes)}:${overlay}`),
  };
}

/**
 * Install the Playwright Chromium browser pen-still-diff captures with.
 * `--with-deps` shells out to apt, which 503s during Ubuntu mirror outages
 * (2026-11-19, run 44519990567). Each retry re-runs apt's own internal
 * fetch retries, so the attempts are naturally spaced; after the last one
 * the error still propagates and the probe fails red.
 */
export async function installPlaywrightBrowser({ root, run, log }) {
  const attempts = 3;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      run(
        'pnpm',
        ['exec', 'playwright', 'install', '--with-deps', 'chromium'],
        { cwd: root, stdio: 'inherit' }
      );
      return;
    } catch (error) {
      if (attempt === attempts) throw error;
      log(
        `playwright install failed (attempt ${attempt}/${attempts}): ${
          error?.message ?? error
        }; retrying`
      );
    }
  }
}

/**
 * `report` gets each workflow output as soon as it is known, so an export
 * that finished still reports itself when the diff after it throws.
 * @param {{ out: string, baseUrl?: string, storageState?: string, surfaceIds?: readonly string[], env?: NodeJS.ProcessEnv, root?: string, run?: typeof defaultRun, fetchImpl?: typeof fetch, log?: (line: string) => void, fetchOnly?: boolean, report?: (name: string, value: string) => void, accepted?: readonly any[] }} options
 */
export async function runGoldenPathPen({
  out,
  baseUrl = 'https://jov.ie',
  storageState,
  surfaceIds = GOLDEN_PATH_SURFACES,
  env = process.env,
  root = REPO_ROOT,
  run = defaultRun,
  fetchImpl = fetch,
  log = line => process.stdout.write(`${line}\n`),
  fetchOnly = false,
  report = () => {},
  accepted = loadAccepted(join(root, 'docs/design-system/pen-accepted')),
}) {
  mkdirSync(out, { recursive: true });
  const manifest = JSON.parse(readFileSync(join(root, MANIFEST), 'utf8'));
  validateGoldenPathManifest(manifest, { root, surfaceIds });
  const frames = designedFrames(manifest);
  const undesigned = manifest.frames.filter(
    f => f.status === 'active' && !frames.includes(f)
  );
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
    accepted,
    penName: manifest.penFile?.name,
    log,
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
    // --with-deps shells out to apt, which fails with 503s during Ubuntu
    // mirror outages (2026-11-19, run 44519990567). Retry a bounded number
    // of times — each attempt re-runs apt's own fetch retries — and still
    // fail red if the browser never installs.
    await installPlaywrightBrowser({ root, run, log });
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
        ...(storageState ? ['--storage-state', storageState] : []),
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
  if (argv.includes('--validate-only')) {
    const manifest = JSON.parse(
      readFileSync(join(REPO_ROOT, MANIFEST), 'utf8')
    );
    validateGoldenPathManifest(manifest, { root: REPO_ROOT });
    process.stdout.write(
      `Golden Path Pen manifest valid (${manifest.frames.length} frames).\n`
    );
    process.exit(0);
  }
  const out = arg('out');
  if (!out) {
    process.stderr.write(
      'usage: pen-golden-path.mjs --out DIR [--base-url URL] [--storage-state FILE] [--fetch-only] [--validate-only] [--github-output FILE]\n'
    );
    process.exit(64);
  }
  const githubOutput = arg('github-output');
  const storageState = arg('storage-state');
  try {
    await runGoldenPathPen({
      out: resolve(out),
      baseUrl: arg('base-url'),
      storageState: storageState ? resolve(storageState) : undefined,
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
