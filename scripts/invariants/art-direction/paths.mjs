import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

export const MARKETING_SOURCE_ROOTS = Object.freeze([
  'apps/web/app/(marketing)',
  'apps/web/app/(home)',
  'apps/web/components/marketing',
  'apps/web/components/homepage',
]);

/** Committed marketing plates. Logos, email icons, and product screenshots stay out. */
export const MARKETING_IMAGE_ROOTS = Object.freeze([
  'apps/web/public/assets/generated',
]);

export const TOKEN_HEX_SOURCES = Object.freeze([
  'design.tokens.json',
  'apps/web/styles/design-system.css',
  'apps/web/data/marketing/imageColorPolicy.ts',
]);

const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  'dist',
  'coverage',
  'storybook-static',
  'generated',
]);
const SKIP_FILE = /\.(?:test|spec|stories)\.[cm]?[jt]sx?$/;
const SOURCE_EXT = new Set(['.ts', '.tsx', '.css', '.js', '.jsx']);

export function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, block => block.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:\\])\/\/.*$/gm, '$1');
}

export function walkFiles(repoRoot, roots, { exts = SOURCE_EXT } = {}) {
  /** @type {string[]} */
  const files = [];
  const visit = absolute => {
    let stats;
    try {
      stats = statSync(absolute);
    } catch {
      return;
    }
    if (stats.isFile()) {
      files.push(absolute);
      return;
    }
    if (!stats.isDirectory()) return;
    for (const entry of readdirSync(absolute)) {
      if (entry.startsWith('.') || SKIP_DIRS.has(entry)) continue;
      visit(join(absolute, entry));
    }
  };
  for (const root of roots) visit(join(repoRoot, root));
  return files.filter(file => {
    const rel = relative(repoRoot, file).split('\\').join('/');
    if (SKIP_FILE.test(rel)) return false;
    const dot = rel.lastIndexOf('.');
    return exts.has(dot === -1 ? '' : rel.slice(dot));
  });
}

export function readRepo(repoRoot, rel) {
  return readFileSync(join(repoRoot, rel), 'utf8');
}

export function relPath(repoRoot, absolute) {
  return relative(repoRoot, absolute).split('\\').join('/');
}
