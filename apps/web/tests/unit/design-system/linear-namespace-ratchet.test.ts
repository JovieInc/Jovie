import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * `--linear-*` namespace shrink-only ratchet (JOV #12009 / #10158).
 *
 * Five token namespaces coexist (`--color/--linear/--ds/--app-shell/
 * --public-shell`). The `--linear-*` namespace is DEPRECATED: canonical
 * values live in `design/tokens.json` (compiled by
 * `scripts/build-design-tokens.mjs`), and consumers migrate to the semantic
 * namespace wave by wave.
 *
 * This ratchet counts every `--linear-` occurrence across live web source
 * (app/, components/, styles/, tailwind.config.js). The count may only go
 * DOWN. When you migrate consumers, lower `count` in
 * linear-namespace.baseline.json in the same PR so the floor follows the
 * work down.
 *
 * Pattern mirrors arbitrary-values-ratchet.test.ts (baseline JSON + source
 * scan; shrink-only).
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
// tests/unit/design-system → apps/web
const WEB_ROOT = join(__dirname, '..', '..', '..');
const BASELINE_PATH = join(__dirname, 'linear-namespace.baseline.json');

const LINEAR_VAR = /--linear-[a-z0-9-]+/g;
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
    } else if (SOURCE_EXT.test(entry) && !/\.test\.[tj]sx?$/.test(entry)) {
      out.push(full);
    }
  }
}

export function countLinearNamespaceUsage(): {
  count: number;
  perFile: Map<string, number>;
} {
  const files: string[] = [];
  for (const dir of ['app', 'components', 'styles']) {
    walk(join(WEB_ROOT, dir), files);
  }
  const tailwindConfig = join(WEB_ROOT, 'tailwind.config.js');
  if (existsSync(tailwindConfig)) files.push(tailwindConfig);

  let count = 0;
  const perFile = new Map<string, number>();
  for (const file of files) {
    const matches = readFileSync(file, 'utf8').match(LINEAR_VAR);
    if (matches && matches.length > 0) {
      count += matches.length;
      perFile.set(relative(WEB_ROOT, file), matches.length);
    }
  }
  return { count, perFile };
}

describe('--linear-* namespace ratchet (shrink-only)', () => {
  it('does not add new --linear-* usage beyond the baseline', () => {
    const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as {
      count: number;
    };
    const { count, perFile } = countLinearNamespaceUsage();

    if (count > baseline.count) {
      const top = [...perFile.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([file, n]) => `  ${file}: ${n}`)
        .join('\n');
      expect.fail(
        `--linear-* usage grew: ${count} > baseline ${baseline.count}. ` +
          `The --linear-* namespace is deprecated (JOV #12009) — use the ` +
          `semantic tokens from design/tokens.json instead.\nTop files:\n${top}`
      );
    }

    // Nudge the floor down when progress lands.
    if (count < baseline.count) {
      expect.fail(
        `--linear-* usage dropped to ${count} (baseline ${baseline.count}). ` +
          `Great — lower "count" in linear-namespace.baseline.json to ${count} ` +
          `in this PR so the ratchet locks in the progress.`
      );
    }

    expect(count).toBe(baseline.count);
  });
});
