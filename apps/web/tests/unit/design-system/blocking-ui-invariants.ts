import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Shared scanner for the blocking UI invariants locked by Tim on 2026-08-30
 * (gbrain ops/reviewed-invariants/blocking-ui-invariants-v1).
 *
 * Fail-closed contract shared by the four rule tests, governed by
 * certify-only-working-v1 (Tim, 2026-08-30): unproven is HIDDEN, not green —
 * a detector may only certify what it actually scanned and proved.
 *  - A missing scan root is a FAILURE (visual/source ENOENT is red, never
 *    advisory).
 *  - Scanning zero files is a FAILURE (a detector that sees nothing proves
 *    nothing — it must not report green).
 *  - No skip(), no soft-pass, no baseline, no allowlist. Violations are red
 *    until the screens are fixed in follow-up PRs.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
// tests/unit/design-system → apps/web
export const WEB_ROOT = join(__dirname, '..', '..', '..');
// apps/web → repo root
export const REPO_ROOT = join(WEB_ROOT, '..', '..');

const SKIP_DIRS = new Set(['node_modules', '.next', '.stryker-tmp', 'dist']);

export interface Violation {
  readonly file: string;
  readonly detail: string;
}

export function requireDir(dir: string, label: string): void {
  if (!existsSync(dir)) {
    throw new Error(
      `[blocking-ui-invariants] scan root missing (ENOENT is FAIL, not advisory): ${label} → ${dir}`
    );
  }
}

export function walkSource(
  dir: string,
  extensions: RegExp,
  out: string[]
): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walkSource(full, extensions, out);
    } else if (extensions.test(entry.name)) {
      out.push(full);
    }
  }
}

const NON_PRODUCT_SOURCE =
  /\.(test|spec|stories)\.[jt]sx?$|__tests__|__mocks__|\/fixtures\//;

/** Product TSX surfaces under apps/web (components/ + app/). */
export function collectWebProductSource(): string[] {
  const roots = [join(WEB_ROOT, 'components'), join(WEB_ROOT, 'app')];
  for (const root of roots) requireDir(root, relative(REPO_ROOT, root));
  const files: string[] = [];
  for (const root of roots) walkSource(root, /\.tsx$/, files);
  const product = files
    .filter(file => !NON_PRODUCT_SOURCE.test(file.split(sep).join('/')))
    .sort((a, b) => a.localeCompare(b));
  if (product.length === 0) {
    throw new Error(
      '[blocking-ui-invariants] zero product TSX files scanned under apps/web — detector is blind, failing closed'
    );
  }
  return product;
}

export function collectSwiftSource(appDir: 'ios' | 'macos'): string[] {
  const root = join(REPO_ROOT, 'apps', appDir);
  requireDir(root, `apps/${appDir}`);
  const files: string[] = [];
  walkSource(root, /\.swift$/, files);
  if (files.length === 0) {
    throw new Error(
      `[blocking-ui-invariants] zero Swift files scanned under apps/${appDir} — detector is blind, failing closed`
    );
  }
  return files.sort((a, b) => a.localeCompare(b));
}

export function repoPath(file: string): string {
  return relative(REPO_ROOT, file).split(sep).join('/');
}

export function read(file: string): string {
  return readFileSync(file, 'utf8');
}

export function lineOf(source: string, index: number): number {
  return source.slice(0, index).split('\n').length;
}

export function formatViolations(
  rule: string,
  violations: Violation[]
): string {
  const lines = violations.map(v => `  - ${v.file} — ${v.detail}`);
  return [
    `${rule}: ${violations.length} violation(s). These screens break a locked blocking UI invariant`,
    '(gbrain ops/reviewed-invariants/blocking-ui-invariants-v1, Tim 2026-08-30).',
    'Fix the screens in follow-up PRs; do NOT weaken this detector or add an allowlist.',
    ...lines,
  ].join('\n');
}

/**
 * Extract every JSX opening tag matching `tagPattern` (component or element
 * name, no angle brackets) together with its attribute text. Handles
 * multi-line opening tags; stops at the first `>` that closes the tag.
 */
export function jsxOpenings(
  source: string,
  tagPattern: RegExp
): {
  readonly tag: string;
  readonly attrs: string;
  readonly index: number;
}[] {
  const out: {
    tag: string;
    attrs: string;
    index: number;
  }[] = [];
  const opener = new RegExp(`<(${tagPattern.source})(?=[\\s/>])`, 'g');
  let match: RegExpExecArray | null = opener.exec(source);
  while (match) {
    const start = match.index;
    const end = source.indexOf('>', start);
    if (end !== -1) {
      out.push({
        tag: match[1],
        attrs: source.slice(start, end + 1),
        index: start,
      });
    }
    match = opener.exec(source);
  }
  return out;
}
