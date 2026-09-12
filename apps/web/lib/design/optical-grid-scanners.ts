/** Shared optical-grid scanners, kept outside test files for real coverage. */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..');

/**
 * Canonical Tailwind steps on the 4px optical grid
 * (`ops/reviewed-invariants/optical-grid-consistent-v1`): 4, 8, 12, 16, 20,
 * 24, 32px and the 8px multiples above. Fractional steps and the odd /
 * in-between integers (7, 9, 11, 13, 14, 28, 36, 44, …) are a second scale.
 */
export const CANONICAL_SPACING_STEPS: ReadonlySet<string> = new Set([
  '0',
  'px',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '8',
  '10',
  '12',
  '16',
  '20',
  '24',
  '32',
  '40',
  '48',
  '56',
  '64',
  '72',
  '80',
  '96',
]);

/** Steps that compete with the seam directly: 10px and 14px. */
export const CONSERVATIVE_STEPS: ReadonlySet<string> = new Set(['2.5', '3.5']);

// Padding, margin, gap and space utilities followed by a numeric step.
// Negative utilities (`-mx-3.5`) count once. Token-resolved utilities
// (`p-(--…)`) and arbitrary values (`p-[13px]`) have no numeric step and are
// out of scope here (arbitrary values ride arbitrary-values-ratchet).
const SPACING_UTILITY =
  /(?<![\w-])-?(?:p|px|py|pt|pr|pb|pl|ps|pe|m|mx|my|mt|mr|mb|ml|ms|me|gap|gap-x|gap-y|space-x|space-y)-(\d+(?:\.\d+)?|px)(?![\w./%])/g;

const SOURCE_EXT = /\.(tsx|ts)$/;
const NON_PRODUCT_FILE = /\.(test|spec|stories)\.[tj]sx?$/;
const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  '.turbo',
  'generated',
  'dist',
  'storybook-static',
]);

export const SPACING_SCALE_FAMILIES = [
  'marketing',
  'web-shell',
  'web-other',
  'packages/ui',
] as const;
export type SpacingScaleFamily = (typeof SPACING_SCALE_FAMILIES)[number];

const SCAN_ROOTS = [
  'apps/web/app',
  'apps/web/components',
  'packages/ui',
] as const;

export function classifySpacingFamily(
  repoRelativePath: string
): SpacingScaleFamily {
  const p = repoRelativePath.split('\\').join('/');
  if (p.startsWith('packages/ui/')) return 'packages/ui';
  if (
    p.includes('/(marketing)/') ||
    p.includes('/(home)/') ||
    p.includes('/components/marketing/') ||
    p.includes('/components/homepage/') ||
    p.includes('/features/home/')
  ) {
    return 'marketing';
  }
  if (
    p.includes('/(shell)/') ||
    p.includes('/components/shell/') ||
    p.includes('/features/dashboard/') ||
    p.includes('/organisms/table/') ||
    p.includes('AppShell')
  ) {
    return 'web-shell';
  }
  return 'web-other';
}

function walk(dir: string, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(full, out);
    } else if (
      SOURCE_EXT.test(entry.name) &&
      !NON_PRODUCT_FILE.test(entry.name)
    ) {
      out.push(full);
    }
  }
}

export interface SpacingScaleMeasurement {
  readonly strict: {
    readonly count: number;
    readonly perFamily: Record<SpacingScaleFamily, number>;
  };
  readonly conservative: {
    readonly count: number;
    readonly perFamily: Record<SpacingScaleFamily, number>;
    readonly perUtility: Record<string, number>;
  };
  readonly perFile: Map<string, number>;
}

function emptyFamilies(): Record<SpacingScaleFamily, number> {
  return { marketing: 0, 'web-shell': 0, 'web-other': 0, 'packages/ui': 0 };
}

export function measureSpacingScale(
  repoRoot = REPO_ROOT
): SpacingScaleMeasurement {
  const files: string[] = [];
  for (const root of SCAN_ROOTS) walk(join(repoRoot, root), files);
  files.sort((a, b) => a.localeCompare(b));

  const strictPerFamily = emptyFamilies();
  const conservativePerFamily = emptyFamilies();
  const perUtility: Record<string, number> = {};
  const perFile = new Map<string, number>();
  let strict = 0;
  let conservative = 0;

  for (const file of files) {
    const rel = relative(repoRoot, file).split('\\').join('/');
    const family = classifySpacingFamily(rel);
    const source = readFileSync(file, 'utf8');
    let fileHits = 0;
    for (const match of source.matchAll(SPACING_UTILITY)) {
      const step = match[1];
      if (CANONICAL_SPACING_STEPS.has(step)) continue;
      strict += 1;
      strictPerFamily[family] += 1;
      fileHits += 1;
      if (CONSERVATIVE_STEPS.has(step)) {
        conservative += 1;
        conservativePerFamily[family] += 1;
        const utility = match[0].replace(/^-/, '');
        perUtility[utility] = (perUtility[utility] ?? 0) + 1;
      }
    }
    if (fileHits > 0) perFile.set(rel, fileHits);
  }

  return {
    strict: { count: strict, perFamily: strictPerFamily },
    conservative: {
      count: conservative,
      perFamily: conservativePerFamily,
      perUtility: Object.fromEntries(
        Object.entries(perUtility).sort(([a], [b]) => a.localeCompare(b))
      ),
    },
    perFile,
  };
}

export const ARBITRARY_RADIUS =
  /(?<![\w-])rounded(?:-(?:t|r|b|l|tl|tr|br|bl|s|e|ss|se|ee|es))?-\[([^\]]+)\]/g;
const DERIVED_RADIUS =
  /^calc\(var\(--radius-[a-z0-9-]+\)\s*[+-]\s*var\(--space-[a-z0-9-]+\)\)$/;

export function isDerivedRadius(value: string): boolean {
  return DERIVED_RADIUS.test(value.trim().replaceAll('_', ' '));
}

export function measureArbitraryRadius(repoRoot = REPO_ROOT): {
  count: number;
  files: number;
  perFile: Map<string, number>;
} {
  const files: string[] = [];
  for (const root of SCAN_ROOTS) walk(join(repoRoot, root), files);
  files.sort((a, b) => a.localeCompare(b));
  const perFile = new Map<string, number>();
  let count = 0;
  for (const file of files) {
    let hits = 0;
    for (const match of readFileSync(file, 'utf8').matchAll(ARBITRARY_RADIUS)) {
      if (isDerivedRadius(match[1])) continue;
      hits += 1;
    }
    if (hits > 0) {
      perFile.set(relative(repoRoot, file).split('\\').join('/'), hits);
      count += hits;
    }
  }
  return { count, files: perFile.size, perFile };
}
