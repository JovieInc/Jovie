import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePathTraversal } from '@/lib/security/path-traversal';

const LIB_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));

export const APP_WEB_ROOT = path.resolve(LIB_DIRECTORY, '..');
export const MONOREPO_ROOT = path.resolve(APP_WEB_ROOT, '..', '..');
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
