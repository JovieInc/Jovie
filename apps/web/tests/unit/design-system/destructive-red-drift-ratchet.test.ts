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
 * Pattern mirrors linear-namespace-ratchet.test.ts (baseline JSON + source
 * scan; shrink-only, merge-group-safe count policy).
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
// tests/unit/design-system → apps/web
const WEB_ROOT = join(__dirname, '..', '..', '..');
const BASELINE_PATH = join(__dirname, 'destructive-red-drift.baseline.json');

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

describe('destructive/red drift ratchet (shrink-only, JOV-6773)', () => {
  it('does not add new {text,bg,border,ring}-destructive usage beyond the baseline', {
    timeout: 60_000,
  }, () => {
    const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as {
      destructiveUtilityCount: number;
    };
    const { count, perFile } = countDestructiveUtilityUsage();
    const verdict = evaluateShrinkOnlyCount({
      count,
      baseline: baseline.destructiveUtilityCount,
      metric: '{text,bg,border,ring}-destructive usage',
    });

    if (!verdict.ok && verdict.status === 'regression') {
      expect.fail(
        `destructive-utility usage grew: ${count} > baseline ${baseline.destructiveUtilityCount}. ` +
          `destructive is a value-preserving alias of -error (tailwind.config.js maps both to ` +
          `--color-error) — use the -error utility instead of adding new -destructive debt.\nTop files:\n${topFiles(perFile)}`
      );
    }
    if (!verdict.ok) {
      expect.fail(
        `${verdict.message} Lower "destructiveUtilityCount" in destructive-red-drift.baseline.json ` +
          `to ${count} in this PR.`
      );
    }
    expect(verdict.ok).toBe(true);
    expect(count).toBeLessThanOrEqual(baseline.destructiveUtilityCount);
  });

  it('does not add new raw {text,bg,border,ring}-red-* usage beyond the baseline', {
    timeout: 60_000,
  }, () => {
    const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as {
      rawRedUtilityCount: number;
    };
    const { count, perFile } = countRawRedUtilityUsage();
    const verdict = evaluateShrinkOnlyCount({
      count,
      baseline: baseline.rawRedUtilityCount,
      metric: '{text,bg,border,ring}-red-* usage',
    });

    if (!verdict.ok && verdict.status === 'regression') {
      expect.fail(
        `raw red-* usage grew: ${count} > baseline ${baseline.rawRedUtilityCount}. ` +
          `Tailwind's default red-* palette is NOT --color-error (#ef4444 vs #f72a36) — use the ` +
          `-error utility for danger/error states, or a brand token for decorative red, instead of ` +
          `adding a new raw red-* call site.\nTop files:\n${topFiles(perFile)}`
      );
    }
    if (!verdict.ok) {
      expect.fail(
        `${verdict.message} Lower "rawRedUtilityCount" in destructive-red-drift.baseline.json ` +
          `to ${count} in this PR.`
      );
    }
    expect(verdict.ok).toBe(true);
    expect(count).toBeLessThanOrEqual(baseline.rawRedUtilityCount);
  });

  it('keeps dead {text,bg,border,ring}-danger/-danger-token usage at zero', {
    timeout: 60_000,
  }, () => {
    const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as {
      deadDangerUtilityCount: number;
    };
    const { count, perFile } = countDeadDangerUtilityUsage();
    const verdict = evaluateShrinkOnlyCount({
      count,
      baseline: baseline.deadDangerUtilityCount,
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
