// Git LFS awareness for the size guards. A path whose .gitattributes filter is
// `lfs` is stored in git as a small pointer, while its working-tree file may
// be the full image (a checkout that pulled LFS) or the pointer (CI default).
// The guards measure what git stores, so they read the committed blob here
// instead of the working-tree file, and they reject a path that should be a
// pointer but was committed as the plain file.

import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

export const LFS_POINTER_PREFIX =
  'version https://git-lfs.github.com/spec/v1\n';
// The spec caps a pointer at 1024 bytes.
const MAX_POINTER_BYTES = 1024;
const MAX_BUFFER = 512 * 1024 * 1024;

/** Parses a blob; returns the LFS object size when it is a pointer, else null. */
export function parseLfsPointer(content) {
  const text = Buffer.isBuffer(content) ? content : Buffer.from(content);
  if (text.length > MAX_POINTER_BYTES) return null;
  const value = text.toString('utf8');
  if (!value.startsWith(LFS_POINTER_PREFIX)) return null;
  const oid = /^oid sha256:([0-9a-f]{64})$/m.exec(value);
  const size = /^size (\d+)$/m.exec(value);
  if (!oid || !size) return null;
  return { oid: oid[1], objectBytes: Number(size[1]) };
}

/** Paths among `paths` whose `filter` attribute is `lfs`. */
export function lfsAttributedPaths(
  paths,
  { cwd = process.cwd(), cached = false } = {}
) {
  const list = paths.filter(path => path && !path.includes('\0'));
  if (list.length === 0) return [];
  const output = execFileSync(
    'git',
    ['check-attr', ...(cached ? ['--cached'] : []), '--stdin', '-z', 'filter'],
    {
      cwd,
      input: `${list.join('\0')}\0`,
      encoding: 'utf8',
      maxBuffer: MAX_BUFFER,
    }
  );
  const parts = output.split('\0');
  const lfs = [];
  for (let index = 0; index + 2 < parts.length; index += 3) {
    if (parts[index + 2] === 'lfs') lfs.push(parts[index]);
  }
  return lfs;
}

/** Splits `git cat-file --batch` output into { size, content } records, in order. */
export function parseCatFileBatch(buffer) {
  const records = [];
  let offset = 0;
  while (offset < buffer.length) {
    const newline = buffer.indexOf(0x0a, offset);
    if (newline < 0) break;
    const header = buffer.subarray(offset, newline).toString('utf8');
    offset = newline + 1;
    const match = /^[0-9a-f]+ (\w+) (\d+)$/.exec(header);
    if (!match) {
      records.push(null);
      continue;
    }
    const size = Number(match[2]);
    records.push({
      type: match[1],
      size,
      content: buffer.subarray(offset, offset + size),
    });
    offset += size + 1;
  }
  return records;
}

/**
 * Map of path -> { blobBytes, pointer, objectBytes } for every LFS-attributed
 * path, read from the index (`staged`) or from `treeish`.
 * @param {{ paths?: string[], cwd?: string, staged?: boolean, treeish?: string }} [options]
 */
export function collectLfsBlobs({
  paths,
  cwd = process.cwd(),
  staged = false,
  treeish = 'HEAD',
} = {}) {
  const lfsPaths = lfsAttributedPaths(paths ?? [], {
    cwd,
    cached: staged,
  }).filter(path => !path.includes('\n'));
  const blobs = new Map();
  if (lfsPaths.length === 0) return blobs;
  const specs = lfsPaths.map(path =>
    staged ? `:${path}` : `${treeish}:${path}`
  );
  const output = execFileSync('git', ['cat-file', '--batch'], {
    cwd,
    input: `${specs.join('\n')}\n`,
    maxBuffer: MAX_BUFFER,
  });
  const records = parseCatFileBatch(output);
  lfsPaths.forEach((path, index) => {
    const record = records[index];
    if (!record || record.type !== 'blob') return;
    const pointer = parseLfsPointer(record.content);
    blobs.set(path, {
      blobBytes: record.size,
      pointer: Boolean(pointer),
      objectBytes: pointer ? pointer.objectBytes : record.size,
    });
  });
  return blobs;
}

/** Errors for LFS-attributed paths that were committed as plain blobs. */
export function plainLfsBlobErrors(lfsBlobs) {
  const errors = [];
  for (const [path, blob] of lfsBlobs) {
    if (!blob.pointer)
      errors.push(
        `${path}: committed as a plain ${blob.blobBytes}-byte file, but .gitattributes stores it in Git LFS; install git-lfs, run \`git lfs install --local\`, then \`git add --renormalize ${path}\``
      );
  }
  return errors;
}

/** Count and bytes of the canonical visual-test baselines under `root`. */
export function collectSnapshotBudget(root, lfsBlobs = new Map()) {
  const snapshotDir = 'apps/web/tests/e2e/__snapshots__';
  const snapshotRoot = resolve(root, snapshotDir);
  let bytes = 0;
  let files = 0;
  function visit(directory) {
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) {
        files += 1;
        // A Git LFS baseline counts at its image size, whether this checkout
        // holds the image or only its pointer.
        const repoPath = `${snapshotDir}/${path.slice(snapshotRoot.length + 1)}`;
        bytes += lfsBlobs.get(repoPath)?.objectBytes ?? statSync(path).size;
      }
    }
  }
  visit(snapshotRoot);
  return { bytes, files };
}
