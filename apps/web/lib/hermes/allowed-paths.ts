const SAFE_HERMES_PATH_REGEX =
  /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[a-zA-Z0-9._/@-]+$/;

function normalizePathValue(path: string): string {
  let normalized = path
    .trim()
    .replaceAll('\\', '/')
    .replaceAll(/\/+/g, '/')
    .replace(/\/$/, '');

  while (normalized.startsWith('./')) {
    normalized = normalized.slice(2);
  }

  return normalized;
}

function comparePath(left: string, right: string): number {
  return left.localeCompare(right);
}

export function normalizeHermesAllowedPath(path: string): string {
  const normalized = normalizePathValue(path);

  if (
    normalized.length === 0 ||
    normalized === '.' ||
    normalized === '..' ||
    normalized.startsWith('../') ||
    normalized.includes('/../') ||
    !SAFE_HERMES_PATH_REGEX.test(normalized)
  ) {
    throw new Error(`Invalid Hermes allowed path: ${path}`);
  }

  return normalized;
}

export function normalizeHermesAllowedPaths(
  paths: readonly string[]
): string[] {
  const normalizedPaths = paths.map(normalizeHermesAllowedPath);
  return [...new Set(normalizedPaths)].sort(comparePath);
}

export function normalizeHermesChangedFile(path: string): string {
  const normalized = normalizePathValue(path);

  if (
    normalized.length === 0 ||
    normalized === '.' ||
    normalized === '..' ||
    normalized.startsWith('../') ||
    normalized.includes('/../') ||
    normalized.startsWith('/') ||
    !SAFE_HERMES_PATH_REGEX.test(normalized)
  ) {
    throw new Error(`Invalid Hermes changed file path: ${path}`);
  }

  return normalized;
}

export function findOutOfScopeHermesChangedFiles(
  changedFiles: readonly string[],
  allowedPaths: readonly string[]
): string[] {
  const normalizedAllowedPaths = normalizeHermesAllowedPaths(allowedPaths);

  return changedFiles
    .map(normalizeHermesChangedFile)
    .filter(
      file =>
        !normalizedAllowedPaths.some(
          allowedPath =>
            file === allowedPath || file.startsWith(`${allowedPath}/`)
        )
    )
    .sort(comparePath);
}

export function assertHermesChangedFilesAllowed(
  changedFiles: readonly string[],
  allowedPaths: readonly string[]
): void {
  const outOfScopeFiles = findOutOfScopeHermesChangedFiles(
    changedFiles,
    allowedPaths
  );

  if (outOfScopeFiles.length > 0) {
    throw new Error(
      [
        'Hermes worker changed files outside allowedPaths:',
        ...outOfScopeFiles.map(path => `- ${path}`),
      ].join('\n')
    );
  }
}
