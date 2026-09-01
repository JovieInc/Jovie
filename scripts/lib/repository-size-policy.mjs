const MiB = 1024 * 1024;
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const GIT_MODE_TYPES = new Map([
  ['040000', 'tree'],
  ['100644', 'blob'],
  ['100755', 'blob'],
  ['120000', 'blob'],
  ['160000', 'commit'],
]);

export const REPOSITORY_MAX_TRACKED_BYTES = 180 * MiB;

export function isRegularGitMode(mode) {
  return mode === '100644' || mode === '100755';
}

function fail(message) {
  throw new Error(`repository size evidence is invalid: ${message}`);
}

export function evaluateGitTreeRepositorySize({
  tree,
  expectedTreeSha,
  maxTrackedBytes = REPOSITORY_MAX_TRACKED_BYTES,
}) {
  if (!SHA_PATTERN.test(String(expectedTreeSha ?? ''))) {
    fail('expected tree SHA is not exact');
  }
  if (!Number.isSafeInteger(maxTrackedBytes) || maxTrackedBytes < 0) {
    fail('tracked-byte limit is malformed');
  }
  if (
    tree?.sha !== expectedTreeSha ||
    tree?.truncated !== false ||
    !Array.isArray(tree?.tree)
  ) {
    fail('Git Trees API did not return the complete exact tree');
  }

  const seenPaths = new Set();
  let trackedBytes = 0;
  let trackedFiles = 0;
  for (const entry of tree.tree) {
    const path = entry?.path;
    const mode = entry?.mode;
    const type = entry?.type;
    if (
      typeof path !== 'string' ||
      path.length === 0 ||
      typeof mode !== 'string' ||
      typeof type !== 'string'
    ) {
      fail('tree entry metadata is malformed');
    }
    if (seenPaths.has(path)) fail(`tree repeats path ${path}`);
    seenPaths.add(path);

    const expectedType = GIT_MODE_TYPES.get(mode);
    if (!expectedType || type !== expectedType) {
      fail(`tree entry ${path} has an unknown mode/type pair`);
    }
    if (!isRegularGitMode(mode)) continue;
    if (!Number.isSafeInteger(entry.size) || entry.size < 0) {
      fail(`regular blob ${path} has no exact byte size`);
    }
    trackedBytes += entry.size;
    trackedFiles += 1;
    if (!Number.isSafeInteger(trackedBytes)) {
      fail('tracked-byte total exceeds safe integer precision');
    }
  }

  return {
    maxTrackedBytes,
    passed: trackedBytes <= maxTrackedBytes,
    trackedBytes,
    trackedFiles,
  };
}
