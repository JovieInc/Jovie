import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { evaluateShrinkOnlyCount } from '@/lib/design/shrink-only-count-ratchet';

/**
 * DS drift: destructive/red color-utility shrink-only ratchet (JOV-6773).
 *
 * `docs/design-system/drift-audit-2026-09-27.md` found three utility names for
 * one danger colour in apps/web: `text-error`, `text-destructive`, and
 * `text-red-*` (plus the matching `bg-*`/`border-*`/`ring-*` forms).
 * `tailwind.config.js` maps `destructive` to `var(--color-error)`, so
 * `{text,bg,border,ring}-destructive` is a value-preserving alias of the
 * canonical `-error` utilities — converging on `-error` never changes a
 * rendered colour. JOV-6773 codemodded the apps/web call sites that were safe
 * to touch under the component-ship-gate (a changed `packages/ui`-adjacent
 * `apps/web/components/**` file must carry a touched test + story in the same
 * diff); the remainder is components whose ship-gate artifacts (story, or a
 * test that actually renders them) don't exist yet, tracked here instead of
 * silently left to grow. `packages/ui` keeps `destructive` as the shadcn
 * variant/prop name and is out of this ratchet's scope; `app/globals.css`
 * keeps one `.text-destructive` rule so that variant keeps resolving color
 * for existing packages/ui consumers.
 *
 * `text-red-*`/`bg-red-*`/`border-red-*`/`ring-red-*` is a SEPARATE metric.
 * Tailwind's default `red-500` (#ef4444) is NOT the same value as
 * `--color-error` (`--color-accent-red` = #f72a36), and not every `red-*`
 * call site is an error/danger state (e.g. the YouTube brand swatch). Merging
 * them is a rendered-colour change that needs design/taste review per call
 * site, not a mechanical rename — this ratchet only stops the raw-red count
 * from growing until that review happens.
 *
 * Floors are per source file (JOV-7708): `destructive-red-drift.baseline/`
 * holds one JSON entry per apps/web file that still carries debt, named
 * `<path with / as __>.json` and discovered by directory listing. Concurrent
 * PRs that burn down different files edit different entries, so they no longer
 * collide on one shared count. A file without an entry has a floor of zero;
 * delete an entry once both of its counts reach zero. Shrink-only and
 * merge-group-safe per file (evaluateShrinkOnlyCount).
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
// tests/unit/design-system → apps/web
const WEB_ROOT = join(__dirname, '..', '..', '..');
const BASELINE_DIR = join(__dirname, 'destructive-red-drift.baseline');
const BASELINE_DIR_NAME = 'destructive-red-drift.baseline';

type FloorMetric = 'destructiveUtilityCount' | 'rawRedUtilityCount';

interface BaselineEntry {
  readonly file: string;
  readonly destructiveUtilityCount: number;
  readonly rawRedUtilityCount: number;
}

/** Entry filename for an apps/web-relative source path. */
export function baselineEntryName(file: string): string {
  return `${file.replaceAll('/', '__')}.json`;
}

function readBaseline(): Map<
  string,
  BaselineEntry & { readonly name: string }
> {
  const entries = new Map<string, BaselineEntry & { readonly name: string }>();
  for (const name of readdirSync(BASELINE_DIR).sort()) {
    if (!name.endsWith('.json')) continue;
    const entry = JSON.parse(
      readFileSync(join(BASELINE_DIR, name), 'utf8')
    ) as BaselineEntry;
    entries.set(entry.file, { ...entry, name });
  }
  return entries;
}

const DESTRUCTIVE_UTILITY = /\b(?:text|bg|border|ring)-destructive\b/g;
const RAW_RED_UTILITY = /\b(?:text|bg|border|ring)-red-\d+\b/g;
// `-danger`/`-danger-token` are NOT aliases like `-destructive`: no theme
// color or component rule defines them, so every use renders an unstyled
// (inherited-color) error state — an invisible-by-default bug, not drift.
// Floor is zero; any new use is a regression, not debt.
const DEAD_DANGER_UTILITY = /\b(?:text|bg|border|ring)-danger(?:-token)?\b/g;
const SOURCE_EXT = /\.(tsx|ts|css)$/;
const SKIP_DIRS = new Set(['node_modules', '.next', '.turbo', 'generated']);

function walk(dir: string, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) {
      if (SKIP_DIRS.has(entry)) continue;
      walk(full, out);
    } else if (
      SOURCE_EXT.test(entry) &&
      !/\.(test|spec|stories)\.[tj]sx?$/.test(entry)
    ) {
      out.push(full);
    }
  }
}

function countUsage(pattern: RegExp): {
  count: number;
  perFile: Map<string, number>;
} {
  const files: string[] = [];
  for (const dir of ['app', 'components', 'lib', 'styles']) {
    walk(join(WEB_ROOT, dir), files);
  }

  let count = 0;
  const perFile = new Map<string, number>();
  for (const file of files) {
    const matches = readFileSync(file, 'utf8').match(pattern);
    if (matches && matches.length > 0) {
      count += matches.length;
      perFile.set(relative(WEB_ROOT, file), matches.length);
    }
  }
  return { count, perFile };
}

export function countDestructiveUtilityUsage() {
  return countUsage(DESTRUCTIVE_UTILITY);
}

export function countRawRedUtilityUsage() {
  return countUsage(RAW_RED_UTILITY);
}

export function countDeadDangerUtilityUsage() {
  return countUsage(DEAD_DANGER_UTILITY);
}

function topFiles(perFile: Map<string, number>): string {
  return [...perFile.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([file, n]) => `  ${file}: ${n}`)
    .join('\n');
}

function perFileFailures(
  metric: FloorMetric,
  label: string,
  perFile: Map<string, number>
): string[] {
  const baseline = readBaseline();
  const files = new Set([...perFile.keys(), ...baseline.keys()]);
  const failures: string[] = [];
  for (const file of [...files].sort()) {
    const count = perFile.get(file) ?? 0;
    const entry = baseline.get(file);
    const verdict = evaluateShrinkOnlyCount({
      count,
      baseline: entry?.[metric] ?? 0,
      metric: `${label} in ${file}`,
    });
    if (verdict.ok) continue;
    const target = `${BASELINE_DIR_NAME}/${entry?.name ?? baselineEntryName(file)}`;
    failures.push(
      verdict.status === 'regression'
        ? `${verdict.message}`
        : `${verdict.message} Set "${metric}" to ${count} in ${target} ` +
            '(delete the entry once both counts are 0).'
    );
  }
  return failures;
}

describe('destructive/red drift ratchet (shrink-only, JOV-6773)', () => {
  it('names every baseline entry for its file and records real debt', () => {
    const baseline = readBaseline();
    expect(baseline.size).toBeGreaterThan(0);
    for (const [file, entry] of baseline) {
      expect(entry.name).toBe(baselineEntryName(file));
      for (const metric of [
        'destructiveUtilityCount',
        'rawRedUtilityCount',
      ] as const) {
        expect(Number.isInteger(entry[metric]) && entry[metric] >= 0).toBe(
          true
        );
      }
      expect(
        entry.destructiveUtilityCount + entry.rawRedUtilityCount
      ).toBeGreaterThan(0);
    }
  });

  it('does not add new {text,bg,border,ring}-destructive usage beyond any file floor', {
    timeout: 60_000,
  }, () => {
    const { perFile } = countDestructiveUtilityUsage();
    const failures = perFileFailures(
      'destructiveUtilityCount',
      '{text,bg,border,ring}-destructive usage',
      perFile
    );
    if (failures.length > 0) {
      expect.fail(
        `${failures.join('\n')}\ndestructive is a value-preserving alias of -error (tailwind.config.js ` +
          `maps both to --color-error): use the -error utility instead of adding new -destructive debt.` +
          `\nTop files:\n${topFiles(perFile)}`
      );
    }
  });

  it('does not add new raw {text,bg,border,ring}-red-* usage beyond any file floor', {
    timeout: 60_000,
  }, () => {
    const { perFile } = countRawRedUtilityUsage();
    const failures = perFileFailures(
      'rawRedUtilityCount',
      '{text,bg,border,ring}-red-* usage',
      perFile
    );
    if (failures.length > 0) {
      expect.fail(
        `${failures.join('\n')}\nTailwind's default red-* palette is NOT --color-error (#ef4444 vs ` +
          `#f72a36): use the -error utility for danger/error states, or a brand token for decorative ` +
          `red, instead of adding a new raw red-* call site.\nTop files:\n${topFiles(perFile)}`
      );
    }
  });

  it('keeps dead {text,bg,border,ring}-danger/-danger-token usage at zero', {
    timeout: 60_000,
  }, () => {
    const { count, perFile } = countDeadDangerUtilityUsage();
    const verdict = evaluateShrinkOnlyCount({
      count,
      baseline: 0,
      metric: '{text,bg,border,ring}-danger/-danger-token usage',
    });

    if (!verdict.ok) {
      expect.fail(
        `${verdict.message} These utilities have no theme definition — ` +
          `every use renders an unstyled error state. Use -error.\nTop files:\n${topFiles(perFile)}`
      );
    }
    expect(count).toBe(0);
  });
});
