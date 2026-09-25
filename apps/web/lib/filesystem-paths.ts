import * as path from 'node:path';
import { validatePathTraversal } from '@/lib/security/path-traversal';

const MODULE_CWD = process.cwd();

function dedupeCandidates(candidates: readonly string[]): string[] {
  return [
    ...new Set(
      candidates.map(candidate =>
        path.resolve(/* turbopackIgnore: true */ candidate)
      )
    ),
  ];
}

// Capture cwd once without deriving an absolute lib directory: NFT can treat
// that derived directory as a file dependency and expand it to the whole app.
// Do not probe package.json, content, or turbo.json here. The deployed launcher
// starts in apps/web; known monorepo, web, and Ovie cwd shapes are enough to
// resolve these roots.
// Every path.resolve/path.join opts out of Turbopack tracing. CLI 59 re-checks
// filePathMap against .vercelignore and still ships the dangling reference, so
// a whole-repo trace fails prebuilt init (JOV-6576). Runtime files are added
// back through outputFileTracingIncludes.
function rootsFromCwd(cwd: string): {
  appWebRoot: string;
  monorepoRoot: string;
} {
  const resolvedCwd = path.resolve(/* turbopackIgnore: true */ cwd);
  let appRoot = resolvedCwd;

  while (true) {
    const appName = path.basename(appRoot);
    const appsDirectory = path.dirname(appRoot);

    if (
      path.basename(appsDirectory) === 'apps' &&
      (appName === 'web' || appName === 'ovie')
    ) {
      return {
        appWebRoot:
          appName === 'web'
            ? appRoot
            : path.join(/* turbopackIgnore: true */ appsDirectory, 'web'),
        monorepoRoot: path.dirname(appsDirectory),
      };
    }

    const parent = path.dirname(appRoot);
    if (parent === appRoot) {
      break;
    }
    appRoot = parent;
  }

  return {
    appWebRoot: path.join(
      /* turbopackIgnore: true */ resolvedCwd,
      'apps',
      'web'
    ),
    monorepoRoot: resolvedCwd,
  };
}

function appWebRootFromPredicate(
  cwd: string,
  pathIsPresent: (candidatePath: string) => boolean
): string {
  const candidates = dedupeCandidates([
    path.resolve(/* turbopackIgnore: true */ MODULE_CWD),
    cwd,
    path.join(/* turbopackIgnore: true */ cwd, 'apps', 'web'),
    path.resolve(/* turbopackIgnore: true */ cwd, '..', 'web'),
    path.resolve(/* turbopackIgnore: true */ MODULE_CWD, '..', '..'),
    path.resolve(/* turbopackIgnore: true */ MODULE_CWD, '..', '..', '..'),
  ]);

  return (
    candidates.find(candidate => isAppWebRoot(candidate, pathIsPresent)) ??
    path.resolve(/* turbopackIgnore: true */ MODULE_CWD)
  );
}

function isAppWebRoot(
  candidate: string,
  pathIsPresent: (candidatePath: string) => boolean
): boolean {
  return (
    pathIsPresent(
      path.join(/* turbopackIgnore: true */ candidate, 'package.json')
    ) &&
    pathIsPresent(path.join(/* turbopackIgnore: true */ candidate, 'content'))
  );
}

function isMonorepoRoot(
  candidate: string,
  pathIsPresent: (candidatePath: string) => boolean
): boolean {
  return (
    pathIsPresent(
      path.join(/* turbopackIgnore: true */ candidate, 'turbo.json')
    ) &&
    pathIsPresent(
      path.join(
        /* turbopackIgnore: true */ candidate,
        'apps',
        'web',
        'package.json'
      )
    )
  );
}

export function resolveAppWebRoot(
  cwd = process.cwd(),
  pathIsPresent?: (candidatePath: string) => boolean
): string {
  return pathIsPresent
    ? appWebRootFromPredicate(cwd, pathIsPresent)
    : rootsFromCwd(cwd).appWebRoot;
}

export function resolveMonorepoRoot(
  cwd = process.cwd(),
  pathIsPresent?: (candidatePath: string) => boolean
): string {
  if (!pathIsPresent) {
    return rootsFromCwd(cwd).monorepoRoot;
  }

  const appWebRoot = resolveAppWebRoot(cwd, pathIsPresent);
  const candidates = dedupeCandidates([
    path.resolve(/* turbopackIgnore: true */ appWebRoot, '..', '..'),
    cwd,
    path.resolve(/* turbopackIgnore: true */ cwd, '..', '..'),
    path.resolve(/* turbopackIgnore: true */ MODULE_CWD, '..'),
    path.resolve(/* turbopackIgnore: true */ MODULE_CWD, '..', '..', '..'),
  ]);

  return (
    candidates.find(candidate => isMonorepoRoot(candidate, pathIsPresent)) ??
    appWebRoot
  );
}

export const APP_WEB_ROOT = resolveAppWebRoot();
export const MONOREPO_ROOT = resolveMonorepoRoot();
export const APP_CONTENT_ROOT = path.join(
  /* turbopackIgnore: true */ APP_WEB_ROOT,
  'content'
);

function normalizeContentRelativePath(relativePath: string): string {
  return relativePath.replace(/^content[\\/]/, '');
}

export function resolveAppContentPath(relativePath: string): string {
  return validatePathTraversal(
    normalizeContentRelativePath(relativePath),
    APP_CONTENT_ROOT
  );
}

export function resolveAppPath(...segments: string[]): string {
  return path.join(/* turbopackIgnore: true */ APP_WEB_ROOT, ...segments);
}

export function resolveMonorepoPath(...segments: string[]): string {
  return path.join(/* turbopackIgnore: true */ MONOREPO_ROOT, ...segments);
}
