import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePathTraversal } from '@/lib/security/path-traversal';

const LIB_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const safeExistsSync: (candidatePath: string) => boolean =
  typeof fs.existsSync === 'function' ? fs.existsSync : () => false;

function dedupeCandidates(candidates: readonly string[]): string[] {
  return [...new Set(candidates.map(candidate => path.resolve(candidate)))];
}

function isAppWebRoot(
  candidate: string,
  exists: (candidatePath: string) => boolean
): boolean {
  return (
    exists(path.join(candidate, 'package.json')) &&
    exists(path.join(candidate, 'content'))
  );
}

function isMonorepoRoot(
  candidate: string,
  exists: (candidatePath: string) => boolean
): boolean {
  return (
    exists(path.join(candidate, 'turbo.json')) &&
    exists(path.join(candidate, 'apps', 'web', 'package.json'))
  );
}

export function resolveAppWebRoot(
  cwd = process.cwd(),
  exists: (candidatePath: string) => boolean = safeExistsSync
): string {
  const candidates = dedupeCandidates([
    path.resolve(LIB_DIRECTORY, '..'),
    cwd,
    path.join(cwd, 'apps', 'web'),
    path.resolve(LIB_DIRECTORY, '..', '..', '..'),
    path.resolve(LIB_DIRECTORY, '..', '..', '..', '..'),
  ]);

  return (
    candidates.find(candidate => isAppWebRoot(candidate, exists)) ??
    path.resolve(LIB_DIRECTORY, '..')
  );
}

export function resolveMonorepoRoot(
  cwd = process.cwd(),
  exists: (candidatePath: string) => boolean = safeExistsSync
): string {
  const appWebRoot = resolveAppWebRoot(cwd, exists);
  const candidates = dedupeCandidates([
    path.resolve(appWebRoot, '..', '..'),
    cwd,
    path.resolve(cwd, '..', '..'),
    path.resolve(LIB_DIRECTORY, '..', '..'),
    path.resolve(LIB_DIRECTORY, '..', '..', '..', '..'),
  ]);

  return (
    candidates.find(candidate => isMonorepoRoot(candidate, exists)) ??
    appWebRoot
  );
}

export const APP_WEB_ROOT = resolveAppWebRoot();
export const MONOREPO_ROOT = resolveMonorepoRoot();
export const APP_CONTENT_ROOT = path.join(APP_WEB_ROOT, 'content');

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
  return path.join(APP_WEB_ROOT, ...segments);
}

export function resolveMonorepoPath(...segments: string[]): string {
  return path.join(MONOREPO_ROOT, ...segments);
}
