import { execFileSync } from 'node:child_process';

const FULL_GIT_SHA = /^[0-9a-f]{40}$/i;

type GitRunner = (args: readonly string[]) => string;

function normalizeGitSha(value: string | null | undefined): string | null {
  const candidate = value?.trim();
  return candidate && FULL_GIT_SHA.test(candidate)
    ? candidate.toLowerCase()
    : null;
}

function runGitFrom(cwd: string): GitRunner {
  return args =>
    execFileSync('git', [...args], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
}

export function resolveScreenshotSourceGitSha({
  cwd = process.cwd(),
  environmentSha = process.env.GITHUB_SHA,
  runGit = runGitFrom(cwd),
}: Readonly<{
  cwd?: string;
  environmentSha?: string;
  runGit?: GitRunner;
}> = {}): string | null {
  try {
    if (runGit(['status', '--porcelain', '--untracked-files=all'])) {
      return null;
    }

    if (environmentSha?.trim()) {
      return normalizeGitSha(environmentSha);
    }

    return normalizeGitSha(runGit(['rev-parse', 'HEAD']));
  } catch {
    return null;
  }
}

export function resolveScreenshotEvidence({
  capturedAt,
  imageChanged,
  previousCapturedAt,
  previousGitSha,
  sourceGitSha,
}: Readonly<{
  capturedAt: string;
  imageChanged: boolean;
  previousCapturedAt?: string;
  previousGitSha?: string | null;
  sourceGitSha: string | null;
}>): Readonly<{ capturedAt: string; gitSha: string | null }> {
  const previousProvenance = normalizeGitSha(previousGitSha);
  const currentProvenance = normalizeGitSha(sourceGitSha);
  const provenanceBackfilled =
    !imageChanged && previousProvenance === null && currentProvenance !== null;

  return {
    capturedAt:
      imageChanged || provenanceBackfilled || !previousCapturedAt
        ? capturedAt
        : previousCapturedAt,
    gitSha: imageChanged
      ? currentProvenance
      : (previousProvenance ?? currentProvenance),
  };
}
