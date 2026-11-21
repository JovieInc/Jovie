#!/usr/bin/env node
// Screenshot store CLI (see scripts/lib/screenshot-store.mjs).
//   pointers [--dry-run]         write/refresh a pointer for every image on disk under the moved paths
//                                (unchanged bytes keep their pointer, so capturedAt stays stable)
//   hydrate [--scope catalog|docs|all]
//                                download every pointer's bytes over HTTPS, verifying sha256 and size
//   verify [--remote] [--scope ...]
//                                validate pointers offline; --remote also HEAD-checks every object in the store
//   upload [--from-git <ref>]    upload every missing object with wrangler (needs CLOUDFLARE_API_TOKEN and
//                                CLOUDFLARE_ACCOUNT_ID). Bytes come from disk, or from <ref> in git when the
//                                binaries were removed from the tree. Idempotent: existing objects are skipped.
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildPointer,
  CATALOG_BINARY_DIR,
  DOCS_BINARY_DIR,
  hydrate,
  isMovedBinary,
  listPointers,
  pointerPathFor,
  publicBase,
  readPointer,
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

function walkBinaries(dir, out = []) {
  if (!existsSync(join(root, dir))) return out;
  for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) walkBinaries(path, out);
    else if (entry.isFile() && isMovedBinary(path)) out.push(path);
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

// A manifest image may be a tracked dedupe symlink to another catalog image.
const isTrackedLink = name => {
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
      if (!pointed.has(name) && !isTrackedLink(name))
        problems.push(`manifest image ${name} has no pointer`);
    for (const name of pointed)
      if (!manifestTimes.has(name))
        problems.push(`pointer for ${name} has no manifest entry`);
  }
  return { problems, total: pointers.length };
}

async function main() {
  if (command === 'pointers') return cmdPointers();

  if (command === 'hydrate') {
    const result = await hydrate({
      root,
      scope,
      log: flag('--verbose') ? console.log : () => {},
    });
    console.log(
      `Hydrated ${result.downloaded} screenshot(s); ${result.present} already verified on disk (${result.total} pointers, scope ${scope}).`
    );
    return;
  }

  if (command === 'verify') {
    const { problems, total } = verifyOffline();
    if (problems.length) {
      console.error(`Screenshot pointers invalid:\n${problems.join('\n')}`);
      process.exitCode = 1;
      return;
    }
    console.log(`${total} screenshot pointer(s) are well formed.`);
    if (flag('--remote')) {
      const remote = await verifyRemote({ root, scope });
      if (remote.missing.length || remote.bad.length) {
        console.error(
          `${uploadHint(publicBase())}\n` +
            `${remote.missing.length} of ${remote.total} objects missing or unreachable, ${remote.bad.length} with the wrong size:\n` +
            [...remote.missing, ...remote.bad].slice(0, 40).join('\n')
        );
        process.exitCode = 1;
        return;
      }
      console.log(`All ${remote.total} objects are present in the store.`);
    }
    return;
  }

  if (command === 'upload') {
    const fromGit = value('--from-git');
    const pointers = listPointers(root, scope);
    const temp = mkdtempSync(join(tmpdir(), 'screenshot-upload-'));
    let uploaded = 0;
    let skipped = 0;
    const failures = [];
    try {
      const remote = await verifyRemote({ root, scope });
      const absent = new Set(remote.missing.map(line => line.split(':')[0]));
      for (const { pointerPath, binaryPath } of pointers) {
        const pointer = readPointer(root, pointerPath);
        if (!absent.has(pointerPath)) {
          skipped += 1;
          continue;
        }
        let file = join(root, binaryPath);
        let bytes = existsSync(file) ? readFileSync(file) : null;
        if (!bytes || verifyBytes(pointer, bytes).length) {
          bytes = null;
          if (fromGit) {
            try {
              bytes = execFileSync(
                'git',
                ['show', `${fromGit}:${binaryPath}`],
                {
                  cwd: root,
                  maxBuffer: 1 << 28,
                }
              );
            } catch {}
            if (bytes && verifyBytes(pointer, bytes).length) bytes = null;
            if (bytes) {
              file = join(temp, pointer.sha256 + extname(binaryPath));
              writeFileSync(file, bytes);
            }
          }
        }
        if (!bytes) {
          failures.push(
            `${binaryPath}: no local or ${fromGit ?? 'git'} bytes match ${pointer.sha256}`
          );
          continue;
        }
        uploadObject(pointer, file);
        uploaded += 1;
        console.log(`uploaded ${binaryPath}`);
      }
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
    if (failures.length) {
      console.error(failures.join('\n'));
      process.exitCode = 1;
      return;
    }
    console.log(`Uploaded ${uploaded}, ${skipped} already in the store.`);
    return;
  }

  console.error(
    'usage: screenshot-store.mjs pointers|hydrate|verify [--remote]|upload [--from-git <ref>]'
  );
  process.exitCode = 2;
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
