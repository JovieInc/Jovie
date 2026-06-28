import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Landing confirmation for the design-system drift convergence stack (#11312).
 *
 * Verifies the active PR rail (#11219–#11228, #11302, #11689) is on main and
 * the ratchet infrastructure is present. Fails if someone rebases main past the
 * stack or deletes the guardrails — the convergence work must stay landed.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..');

/** Squash-merge SHAs for the design-system drift stack (GitHub issue #11312). */
const STACK_MERGE_COMMITS = [
  'b6714ee761c94c8bd7a18130d6b7067ea3c24e31', // #11219 features/dashboard
  '2dcea288d67fdd227a5fee8250cc4ee619631034', // #11221 features misc
  'c3858b87e33237b72bac692b2df7c5a5bea48d95', // #11223 marketing
  'f30634d28104c776517607cd15b7d777468a3e83', // #11225 organisms
  'cfd18c58a97aa2d5e32cf00db257bf769730424c', // #11226 molecules
  'ef6dab6e1351547aede295f7af561c5d3a97938a', // #11227 shell+atoms
  'a40fbfbf483a13cf722208bc4a43d3388dc3dbe1', // #11228 app-core
  'c521b5ccb03f03198379d1e5402296678f078103', // #11302 exp Biome + label-casing
  '032f6b616f86d5e3e44ecaeb5c0d90f166ce68c7', // #11689 token-drift sweep
] as const;

const RATCHET_FILES = [
  'apps/web/tests/unit/design-system/arbitrary-values-ratchet.test.ts',
  'apps/web/tests/unit/design-system/arbitrary-values.baseline.json',
  'apps/web/tests/unit/design-system/server-imports-ratchet.test.ts',
  'apps/web/tests/unit/design-system/server-imports.baseline.json',
  'apps/web/tests/unit/design-system/singular-system-b-ratchet.test.ts',
  'apps/web/tests/unit/design-system/raw-button-ratchet.test.ts',
  'apps/web/tests/unit/design-system/component-family-ratchet.test.ts',
  'apps/web/tests/unit/app/exp-drift-lint-guard.test.ts',
] as const;

function isAncestor(commit: string): boolean {
  try {
    execSync(`git merge-base --is-ancestor ${commit} HEAD`, {
      cwd: REPO_ROOT,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

describe('design-system drift stack landed (#11312)', () => {
  it('stack merge commits are ancestors of HEAD', () => {
    const missing = STACK_MERGE_COMMITS.filter(sha => !isAncestor(sha));
    expect(
      missing,
      `Design-system drift stack not fully on main — missing merge commits:\n${missing.join('\n')}`
    ).toEqual([]);
  });

  it('drift ratchet infrastructure files exist', () => {
    const absent = RATCHET_FILES.filter(
      rel => !existsSync(join(REPO_ROOT, rel))
    );
    expect(
      absent,
      `Drift ratchet files missing — convergence guardrails were removed:\n${absent.join('\n')}`
    ).toEqual([]);
  });

  it('arbitrary-values baseline is not inflated above current count', () => {
    const baselinePath = join(__dirname, 'arbitrary-values.baseline.json');
    const baseline = JSON.parse(readFileSync(baselinePath, 'utf8')) as {
      count: number;
    };

    // Reuse the ratchet's counting logic via a minimal inline scan so this
    // test fails when baseline drifts above actual without a tokenization PR.
    const ARBITRARY = /\b[a-z][a-z0-9]*(?:-[a-z0-9]+)*-\[[^\]]+\]/gi;
    const SCAN_DIRS = ['components', 'app'].map(d =>
      join(REPO_ROOT, 'apps/web', d)
    );

    function walk(dir: string, out: string[]): void {
      if (!existsSync(dir)) return;
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        const s = statSync(full);
        if (s.isDirectory()) {
          if (entry === 'node_modules' || entry === '.next') continue;
          walk(full, out);
        } else if (/\.(tsx|ts)$/.test(entry)) {
          out.push(full);
        }
      }
    }

    const files: string[] = [];
    for (const dir of SCAN_DIRS) walk(dir, files);
    let current = 0;
    for (const file of files) {
      const matches = readFileSync(file, 'utf8').match(ARBITRARY);
      if (matches) current += matches.length;
    }

    expect(
      baseline.count,
      `Baseline ${baseline.count} is above actual count ${current} — lower arbitrary-values.baseline.json in the same PR that reduced drift`
    ).toBeLessThanOrEqual(current);
  });
});
