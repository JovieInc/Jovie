#!/usr/bin/env node
// Screenshot store CLI (see scripts/lib/screenshot-store.mjs). The bucket is
// private: every remote command needs R2_ACCOUNT_ID, R2_ACCESS_KEY_ID and
// R2_SECRET_ACCESS_KEY in the environment (read-only key for hydrate/verify,
// write key for upload).
//   pointers [--dry-run]         write/refresh a pointer for every moved image on disk (images the live site
//                                serves stay in git and get no pointer; unchanged bytes keep their pointer)
//   served                       list the catalog images the live site serves (they stay in git)
//   hydrate [--scope catalog|docs|all] [--optional]
//                                download every pointer's bytes, verifying sha256 and size; --optional skips
//                                cleanly (exit 0) when credentials are absent
//   verify [--remote] [--base <rev>] [--scope ...]
//                                validate pointers offline; --remote also HEAD-checks every object in the
//                                store and FAILS without credentials. --base skips the remote check when no
//                                pointer or store code changed since <rev>.
//   upload [--from <ref>]        upload every missing object (write key). Bytes come from disk, or from <ref>
//                                in git when the binaries are gone from the tree. Idempotent.
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  statSync,
} from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MISSING_CREDENTIALS, storeConfig } from './lib/r2-store-client.mjs';
import {
  buildPointer,
  CATALOG_BINARY_DIR,
  DOCS_BINARY_DIR,
  hydrate,
  isMovedBinary,
  listPointers,
  pointerPathFor,
  readPointer,
  servedCatalogImages,
  sha256,
  uploadHint,
  uploadObject,
  validatePointer,
  verifyBytes,
  verifyRemote,
  writePointer,
} from './lib/screenshot-store.mjs';

// Script-relative so hydrate also works where there is no .git (Vercel builds).
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [command, ...rest] = process.argv.slice(2);
const flag = name => rest.includes(name);
const value = name =>
  rest.includes(name) ? rest[rest.indexOf(name) + 1] : undefined;
const scope = value('--scope') ?? 'all';
const served = servedCatalogImages(root);

function walkBinaries(dir, out = []) {
  if (!existsSync(join(root, dir))) return out;
  for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) walkBinaries(path, out);
    else if (entry.isFile() && isMovedBinary(path, served)) out.push(path);
  }
  return out;
}

function pngSize(bytes) {
  return bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a'
    ? `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`
    : null;
}

function catalogCapturedAt() {
  const manifestPath = join(root, CATALOG_BINARY_DIR, 'manifest.json');
  if (!existsSync(manifestPath)) return new Map();
  return new Map(
    JSON.parse(readFileSync(manifestPath, 'utf8')).map(entry => [
      entry.imagePath,
      entry.capturedAt,
    ])
  );
}

function capturedAtFor(binaryPath, manifestTimes) {
  const fromManifest = manifestTimes.get(basename(binaryPath));
  if (binaryPath.startsWith(`${CATALOG_BINARY_DIR}/`) && fromManifest)
    return fromManifest;
  try {
    const committed = execFileSync(
      'git',
      ['log', '-1', '--format=%cI', '--', binaryPath],
      { cwd: root, encoding: 'utf8' }
    ).trim();
    if (committed) return new Date(committed).toISOString();
  } catch {}
  return new Date(statSync(join(root, binaryPath)).mtimeMs).toISOString();
}

function cmdPointers() {
  const manifestTimes = catalogCapturedAt();
  const binaries = [
    ...walkBinaries(CATALOG_BINARY_DIR),
    ...walkBinaries(DOCS_BINARY_DIR),
  ].sort();
  let written = 0;
  for (const binaryPath of binaries) {
    const bytes = readFileSync(join(root, binaryPath));
    const pointerPath = pointerPathFor(binaryPath);
    if (existsSync(join(root, pointerPath))) {
      const existing = readPointer(root, pointerPath);
      if (existing.sha256 === sha256(bytes)) continue;
    }
    const pointer = buildPointer({
      bytes,
      extension: extname(binaryPath),
      viewport: pngSize(bytes),
      capturedAt: capturedAtFor(binaryPath, manifestTimes),
    });
    if (!flag('--dry-run')) writePointer(root, pointerPath, pointer);
    written += 1;
  }
  console.log(
    `${written} pointer(s) written, ${binaries.length - written} unchanged.`
  );
}

// A manifest image may be a tracked dedupe symlink to another catalog image,
// or an image the live site serves (kept in git, no pointer).
const isInGit = name => {
  if (served.has(`${CATALOG_BINARY_DIR}/${name}`)) return true;
  try {
    return lstatSync(join(root, CATALOG_BINARY_DIR, name)).isSymbolicLink();
  } catch {
    return false;
  }
};

function verifyOffline() {
  const problems = [];
  const pointers = listPointers(root, scope);
  for (const { pointerPath, binaryPath } of pointers) {
    const pointer = readPointer(root, pointerPath);
    const bad = validatePointer(pointer);
    if (bad.length) problems.push(`${pointerPath}: ${bad.join(', ')}`);
    else if (
      existsSync(join(root, binaryPath)) &&
      verifyBytes(pointer, readFileSync(join(root, binaryPath))).length
    )
      problems.push(
        `${binaryPath}: on-disk bytes differ from ${pointerPath}; run "node scripts/screenshot-store.mjs pointers" and upload`
      );
  }
  if (scope === 'all' || scope === 'catalog') {
    const manifestTimes = catalogCapturedAt();
    const pointed = new Set(
      listPointers(root, 'catalog').map(p => basename(p.binaryPath))
    );
    for (const name of manifestTimes.keys())
      if (!pointed.has(name) && !isInGit(name))
        problems.push(`manifest image ${name} has no pointer`);
    for (const name of pointed) {
      if (!manifestTimes.has(name))
        problems.push(`pointer for ${name} has no manifest entry`);
      if (served.has(`${CATALOG_BINARY_DIR}/${name}`))
        problems.push(
          `pointer for ${name}: the live site serves it, so it stays in git; delete the pointer`
        );
    }
  }
  return { problems, total: pointers.length };
}

function pointersChangedSince(base) {
  const changed = execFileSync(
    'git',
    [
      'diff',
      '--name-only',
      base,
      'HEAD',
      '--',
      'apps/web/screenshot-catalog/pointers/',
      'docs/screenshots/',
      'scripts/',
    ],
    { cwd: root, encoding: 'utf8' }
  );
  return changed
    .split('\n')
    .some(
      path =>
        path.endsWith('.pointer.json') || /screenshot-store|r2-store/.test(path)
    );
}

async function cmdVerify() {
  const { problems, total } = verifyOffline();
  if (problems.length) {
    console.error(`Screenshot pointers invalid:\n${problems.join('\n')}`);
    process.exitCode = 1;
    return;
  }
  console.log(`${total} screenshot pointer(s) are well formed.`);
  if (!flag('--remote')) return;
  const base = value('--base');
  if (base && !pointersChangedSince(base)) {
    console.log('No pointer changes since the base; remote check not needed.');
    return;
  }
  let remote;
  try {
    remote = await verifyRemote({ root, scope });
  } catch (error) {
    console.error(`${uploadHint()}\n${error.message}`);
    process.exitCode = 1;
    return;
  }
  if (remote.missing.length || remote.bad.length) {
    console.error(
      `${uploadHint()}\n` +
        `${remote.missing.length} of ${remote.total} objects missing or unreachable, ${remote.bad.length} with the wrong size:\n` +
        [...remote.missing, ...remote.bad].slice(0, 40).join('\n')
    );
    process.exitCode = 1;
    return;
  }
  console.log(`All ${remote.total} objects are present in the store.`);
}

function bytesFor({ pointer, binaryPath, fromRef }) {
  const local = join(root, binaryPath);
  const candidates = [() => existsSync(local) && readFileSync(local)];
  if (fromRef)
    candidates.push(() =>
      execFileSync('git', ['show', `${fromRef}:${binaryPath}`], {
        cwd: root,
        maxBuffer: 1 << 28,
      })
    );
  for (const read of candidates) {
    try {
      const bytes = read();
      if (bytes && !verifyBytes(pointer, bytes).length) return bytes;
    } catch {}
  }
  return null;
}

async function cmdUpload() {
  const fromRef = value('--from');
  const config = storeConfig();
  if (!config) {
    console.error(`${MISSING_CREDENTIALS} Upload needs a write key.`);
    process.exitCode = 1;
    return;
  }
  const remote = await verifyRemote({ root, scope, config });
  const absent = new Set(remote.missing.map(line => line.split(':')[0]));
  let uploaded = 0;
  let skipped = 0;
  const failures = [];
  for (const { pointerPath, binaryPath } of listPointers(root, scope)) {
    if (!absent.has(pointerPath)) {
      skipped += 1;
      continue;
    }
    const pointer = readPointer(root, pointerPath);
    const bytes = bytesFor({ pointer, binaryPath, fromRef });
    if (!bytes) {
      failures.push(
        `${binaryPath}: no local or ${fromRef ?? 'git'} bytes match ${pointer.sha256}`
      );
      continue;
    }
    try {
      await uploadObject(config, pointer, bytes);
      uploaded += 1;
      console.log(`uploaded ${binaryPath}`);
    } catch (error) {
      failures.push(`${binaryPath}: ${error.message}`);
    }
  }
  if (failures.length) {
    console.error(failures.join('\n'));
    process.exitCode = 1;
    return;
  }
  console.log(`Uploaded ${uploaded}, ${skipped} already in the store.`);
}

async function main() {
  if (command === 'pointers') return cmdPointers();
  if (command === 'served') return console.log([...served].sort().join('\n'));
  if (command === 'verify') return cmdVerify();
  if (command === 'upload') return cmdUpload();

  if (command === 'hydrate') {
    const result = await hydrate({
      root,
      scope,
      optional: flag('--optional'),
      log: flag('--verbose') ? console.log : () => {},
    });
    const note = result.skipped
      ? ` ${result.skipped} not fetched: no R2 credentials (optional).`
      : '';
    console.log(
      `Hydrated ${result.downloaded} screenshot(s); ${result.present} already verified on disk (${result.total} pointers, scope ${scope}).${note}`
    );
    return;
  }

  console.error(
    'usage: screenshot-store.mjs pointers|served|hydrate [--optional]|verify [--remote] [--base <rev>]|upload [--from <ref>]'
  );
  process.exitCode = 2;
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
