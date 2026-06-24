import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Server-import drift ratchet for shared presentation layers.
 *
 * Scans `apps/web/components/{atoms,molecules,organisms}` for files that
 * import server-only specifiers (e.g. `server-only`, `@clerk/nextjs/server`,
 * `drizzle-orm`, `@/lib/db/*`, `/actions` modules, `next/headers`, etc.)
 * or contain `'use server'`. The count may only go DOWN: when a flagged
 * organism is refactored so its server-action import moves to a wrapping
 * feature component, lower the baseline in `server-imports.baseline.json`
 * in the same PR.
 *
 * Why a ratchet and not zero-tolerance: 3 organisms currently have a
 * legitimate /actions import that predates this rule:
 *   - organisms/CreateProfileDialog.tsx
 *   - organisms/ProfileSwitcher.tsx
 *   - organisms/release-sidebar/ReleaseSidebar.tsx
 * Banning them outright would block all work. The ratchet locks in
 * progress — regressions fail CI, improvements (moving the import up to a
 * feature wrapper) pass and lower the baseline.
 *
 * Sibling of arbitrary-values-ratchet.test.ts — same committed-baseline shape.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
// tests/unit/design-system → apps/web
const WEB_ROOT = join(__dirname, '..', '..', '..');
const SCAN_DIRS = ['atoms', 'molecules', 'organisms'].map(d =>
  join(WEB_ROOT, 'components', d)
);
const BASELINE_PATH = join(__dirname, 'server-imports.baseline.json');

// Server-only package specifiers (mirrors apps/web/eslint-rules/server-only-imports.js).
const SERVER_ONLY_SPECIFIERS = new Set([
  'server-only',
  '@clerk/nextjs/server',
  '@neondatabase/serverless',
  'drizzle-orm',
  'drizzle-orm/neon-serverless',
  'stripe',
  'resend',
]);

// Server-only path patterns (mirrors eslint-rules/server-only-imports.js).
const SERVER_ONLY_PATH_PATTERNS: RegExp[] = [
  /^@\/lib\/db(?:\/|$)/, // @/lib/db/*
  /^@\/lib\/auth\/session$/,
  /^@\/lib\/auth\/cached$/,
  /^@\/lib\/auth\/gate$/,
  /^@\/lib\/env-server/,
  /^@\/lib\/stripe\/client$/,
  /^@\/lib\/admin\/(?!types$|csv-configs\/)/, // @/lib/admin/* (except types.ts and csv-configs/)
  /\.server$/, // *.server.ts files
];

// Additional server-only patterns specific to this ratchet.
const ADDITIONAL_SERVER_PATTERNS: RegExp[] = [
  /\/actions(?:\/|$)/, // imports from /actions or /actions/* modules (server actions)
  /^next\/headers$/, // next/headers
  /^next\/cache$/, // next/cache
];

// Files intentionally allowed to be server-side within the component tree.
const EXCLUDE_FILE_PATTERNS: RegExp[] = [
  /\.stories\.tsx$/, // Storybook stories
  /\.test\.ts$/, // Unit tests
  /\.test\.tsx$/, // Unit tests (tsx)
  /-action\.ts$/, // Dedicated server-action files (e.g. release-credits-action.ts)
  /\.server\.ts$/, // Explicit server-module files
];

const SOURCE_EXT = /\.(tsx|ts)$/;

// Regex to match import statement source strings.
// Captures both: import ... from '...'; and bare side-effect imports: import '...';
const IMPORT_FROM = /(?:^|\n)\s*import\s+(?:[^'"]+from\s+)?['"]([^'"]+)['"]/g;

function isServerOnlySource(source: string): boolean {
  if (SERVER_ONLY_SPECIFIERS.has(source)) return true;
  for (const pattern of SERVER_ONLY_PATH_PATTERNS) {
    if (pattern.test(source)) return true;
  }
  for (const pattern of ADDITIONAL_SERVER_PATTERNS) {
    if (pattern.test(source)) return true;
  }
  return false;
}

function isExcluded(filePath: string): boolean {
  return EXCLUDE_FILE_PATTERNS.some(p => p.test(filePath));
}

function walk(dir: string, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) {
      if (entry === 'node_modules' || entry === '.next') continue;
      walk(full, out);
    } else if (SOURCE_EXT.test(entry)) {
      out.push(full);
    }
  }
}

function countServerImportFiles(): number {
  const files: string[] = [];
  for (const dir of SCAN_DIRS) walk(dir, files);

  let flagged = 0;
  for (const file of files) {
    if (isExcluded(file)) continue;

    const content = readFileSync(file, 'utf8');

    // Check for 'use server' directive
    if (/^['"]use server['"]/m.test(content)) {
      flagged++;
      continue;
    }

    // Check import sources
    let match: RegExpExecArray | null;
    IMPORT_FROM.lastIndex = 0;
    let found = false;
    while ((match = IMPORT_FROM.exec(content)) !== null) {
      if (isServerOnlySource(match[1])) {
        found = true;
        break;
      }
    }
    if (found) flagged++;
  }

  return flagged;
}

describe('design-system server-imports ratchet', () => {
  it('server-only imports in atoms/molecules/organisms do not increase above the baseline', () => {
    const current = countServerImportFiles();

    // Self-seed on first run so the baseline and the count logic can never
    // diverge. Commit the seeded file; CI compares against it.
    if (!existsSync(BASELINE_PATH)) {
      writeFileSync(
        BASELINE_PATH,
        `${JSON.stringify(
          {
            count: current,
            note:
              'Files in apps/web/components/{atoms,molecules,organisms} that import a server-only ' +
              'specifier (server-only, @clerk/nextjs/server, drizzle-orm, @/lib/db/*, /actions modules, ' +
              "next/headers, next/cache, etc.) or contain 'use server'. " +
              'Baseline of 3 reflects organism offenders: CreateProfileDialog.tsx, ' +
              'ProfileSwitcher.tsx, release-sidebar/ReleaseSidebar.tsx (all import from /actions). ' +
              'Exclusions: *.stories.tsx, *.test.ts(x), *-action.ts, *.server.ts. ' +
              'Ratchet only goes down — lower this when a PR moves the /actions import to a feature wrapper.',
          },
          null,
          2
        )}\n`
      );
    }

    const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as {
      count: number;
    };

    expect(
      current,
      `Server-only imports in shared layers rose to ${current} (baseline ${baseline.count}). ` +
        'atoms/molecules/organisms must not import server-only specifiers — move the import to a ' +
        'feature wrapper or API route. If this is intentional, justify it in review and raise ' +
        'the baseline with a Linear ID.'
    ).toBeLessThanOrEqual(baseline.count);
  });
});
