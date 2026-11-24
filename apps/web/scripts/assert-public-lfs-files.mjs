// The product screenshot catalog (apps/web/screenshot-catalog/current) is
// stored in Git LFS, and apps/web/public/product-screenshots links into it. A
// checkout without `git lfs pull` leaves 130-byte pointer files there, which
// the standalone server then serves as broken images, and Turbo caches that
// output for every later build with the same inputs. sync-standalone-assets
// calls this first: fail the build in CI before it copies pointers. Warn on a
// local build and on Vercel's own source-deploy fallback, which must not be
// blocked by it.
import { closeSync, openSync, readdirSync, readSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const POINTER_PREFIX = 'version https://git-lfs.github.com/spec/v1\n';
const MAX_POINTER_BYTES = 1024;

export function isLfsPointerFile(filePath) {
  const stats = statSync(filePath, { throwIfNoEntry: false });
  if (!stats?.isFile() || stats.size > MAX_POINTER_BYTES) return false;
  const fd = openSync(filePath, 'r');
  try {
    const buffer = Buffer.alloc(POINTER_PREFIX.length);
    const read = readSync(fd, buffer, 0, buffer.length, 0);
    return buffer.toString('utf8', 0, read) === POINTER_PREFIX;
  } finally {
    closeSync(fd);
  }
}

export function findLfsPointers(rootDir) {
  const found = [];
  const walk = dir => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const entryPath = path.join(dir, entry.name);
      const stats = statSync(entryPath, { throwIfNoEntry: false });
      if (stats?.isDirectory()) walk(entryPath);
      else if (isLfsPointerFile(entryPath))
        found.push(path.relative(rootDir, entryPath));
    }
  };
  walk(rootDir);
  return found.sort();
}

export function assertPublicLfsFiles({
  publicDir,
  ci = process.env.CI,
  vercel = process.env.VERCEL,
}) {
  const pointers = findLfsPointers(publicDir);
  if (pointers.length === 0) return pointers;
  const message =
    `${pointers.length} file(s) under ${publicDir} are Git LFS pointers; ` +
    'run `git lfs pull --include "apps/web/screenshot-catalog/current/*.png,apps/web/public/demo/jovie-demo.mp4"` ' +
    '(in CI: the .github/actions/lfs-pull step) before the build: ' +
    pointers.slice(0, 5).join(', ');
  if (ci && ci !== 'false' && !vercel) throw new Error(message);
  console.warn(`Warning: ${message}`);
  return pointers;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const appRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..'
  );
  assertPublicLfsFiles({ publicDir: path.join(appRoot, 'public') });
}
