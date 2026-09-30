import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// ESLint custom rules (label casing, banned marketing copy, raw motion,
// hardcoded theme colors, icon usage) were pre-commit-only until this gate.
const repoRoot = resolve(process.cwd(), '..', '..');

describe('changed-file ESLint gate', () => {
  it('runs in required Source Validation against the PR base', () => {
    const workflow = readFileSync(
      resolve(repoRoot, '.github/workflows/source-validation.yml'),
      'utf8'
    );
    expect(workflow).toContain(
      'ESLINT_CHANGED_BASE="origin/${{ github.base_ref }}" pnpm --filter @jovie/web run lint:eslint:changed'
    );
  });

  it('lints whole changed files with zero warnings allowed', () => {
    const script = readFileSync(
      resolve(process.cwd(), 'scripts/lint-eslint-changed.mjs'),
      'utf8'
    );
    expect(script).toContain("'--max-warnings=0'");
    expect(script).toContain("'--diff-filter=ACMR'");
    expect(script).toMatch(/apps\\\/web\\\/\.\+\\\.\(ts\|tsx\)/);
  });
});
