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
 * Duplicate-component-family guard (count ratchet).
 *
 * Counts component files per drift-prone family (`*Button`, `*Palette`,
 * `*EmptyState`, `*Shell`) under apps/web/components. The count may only go
 * DOWN. Convergence collapses duplicate implementations onto one canonical
 * per family; this ratchet stops NEW one-off variants from landing while that
 * work is in flight.
 *
 * Seeded at the current count, so it never reds-out main and never blocks an
 * unrelated PR — it only triggers on a PR that ADDS a new family file. To add
 * a genuinely-distinct component, raise the family's baseline in the SAME PR
 * with a Linear ID in the description (the inverse of "lower it when you dedup").
 *
 * WARN_ONLY: ships warn-mode first (per the convergence plan, D3) so the
 * mechanism + baseline land without risk. Flip WARN_ONLY to false once the
 * wave-1 dedup PRs (button/CTA, command palettes) have landed and the
 * canonical set is settled — then growth fails CI instead of just warning.
 *
 * Sibling of arbitrary-values-ratchet.test.ts / raw-button-ratchet.test.ts.
 */

const WARN_ONLY = false;

const __dirname = dirname(fileURLToPath(import.meta.url));
// tests/unit/design-system → apps/web
const WEB_ROOT = join(__dirname, '..', '..', '..');
const SCAN_DIR = join(WEB_ROOT, 'components');
const BASELINE_PATH = join(__dirname, 'component-family.baseline.json');

const FAMILIES = {
  button: /Button\.tsx$/,
  palette: /Palette\.tsx$/,
  emptyState: /EmptyState\.tsx$/,
  shell: /Shell\.tsx$/,
} as const;
type Family = keyof typeof FAMILIES;

// Exclude tests, stories, and type/util siblings — count only component files.
const EXCLUDED = /\.(test|stories)\.tsx$/;

function walk(dir: string, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) {
      if (entry === 'node_modules' || entry === '.next') continue;
      walk(full, out);
    } else if (entry.endsWith('.tsx') && !EXCLUDED.test(entry)) {
      out.push(entry);
    }
  }
}

function countFamilies(): Record<Family, number> {
  const files: string[] = [];
  walk(SCAN_DIR, files);
  const counts = { button: 0, palette: 0, emptyState: 0, shell: 0 };
  for (const name of files) {
    for (const family of Object.keys(FAMILIES) as Family[]) {
      if (FAMILIES[family].test(name)) counts[family] += 1;
    }
  }
  return counts;
}

describe('design-system component-family ratchet', () => {
  it('duplicate component families do not grow above the baseline', () => {
    const current = countFamilies();

    if (!existsSync(BASELINE_PATH)) {
      writeFileSync(
        BASELINE_PATH,
        `${JSON.stringify({ counts: current, note: 'Component files per drift-prone family in apps/web/components. Ratchet only goes down — lower when you dedup, raise with a Linear ID for a genuinely-distinct new component. Flip WARN_ONLY=false in the test after wave-1 dedup lands.' }, null, 2)}\n`
      );
    }

    const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as {
      counts: Record<Family, number>;
    };

    const grown = (Object.keys(FAMILIES) as Family[]).filter(
      family => current[family] > baseline.counts[family]
    );

    if (grown.length > 0) {
      const detail = grown
        .map(f => `${f}: ${current[f]} (baseline ${baseline.counts[f]})`)
        .join(', ');
      const message =
        `New duplicate-family component file(s) detected — ${detail}. ` +
        'Reuse/extend the canonical component for that family instead of adding a variant. ' +
        'If genuinely distinct, raise the baseline in component-family.baseline.json in this PR with a Linear ID.';
      if (WARN_ONLY) {
        // Warn-mode: surface drift without blocking. Flip WARN_ONLY=false
        // after wave-1 dedup lands to make this a hard gate.
        console.warn(`[component-family ratchet — WARN] ${message}`);
      } else {
        expect.fail(message);
      }
    }

    // Sanity: baseline keys stay in sync with the family list.
    expect(Object.keys(baseline.counts).sort()).toEqual(
      Object.keys(FAMILIES).sort()
    );
  });
});
