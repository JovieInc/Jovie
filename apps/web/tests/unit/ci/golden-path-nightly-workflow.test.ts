import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const WORKFLOW_PATH = resolve(
  __dirname,
  '../../../../../.github/workflows/golden-path-nightly.yml'
);

describe('golden-path-nightly workflow skip gate', () => {
  it('inspects the latest executed Golden Path (manual) run and stops on failure instead of scanning back to a stale green run', () => {
    const workflow = readFileSync(WORKFLOW_PATH, 'utf8');
    expect(workflow).toContain('.conclusion != "skipped"');
    expect(workflow).toContain('if [ "$conclusion" = "success" ]; then');
    expect(workflow).not.toContain(
      'select(.name == "Golden Path (manual)" and .conclusion == "success")] | length'
    );

    // Execute the exact shell loop semantics against mocked runs:
    // run 103 (skipped job) -> ignored;
    // run 102 (latest executed Golden Path = failure on sha_head) -> breaks empty (must NOT fall back to run 101 success on sha_head).
    const dir = mkdtempSync(join(tmpdir(), 'gp-nightly-test-'));
    try {
      const mockScript = join(dir, 'eval.sh');
      writeFileSync(
        mockScript,
        `#!/usr/bin/env bash
set -euo pipefail
runs=("103" "102" "101")
last_green="$(printf '%s\\n' "\${runs[@]}" | while read -r run; do
  case "$run" in
    103) jobs='[{"name":"Golden Path (manual)","conclusion":"skipped"}]' ;;
    102) jobs='[{"name":"Golden Path (manual)","conclusion":"failure"}]' ;;
    101) jobs='[{"name":"Golden Path (manual)","conclusion":"success"}]' ;;
  esac
  conclusion="$(printf '%s' "$jobs" | jq -r '[.[] | select(.name == "Golden Path (manual)" and .conclusion != null and .conclusion != "skipped")][0].conclusion // empty')"
  if [ -z "$conclusion" ]; then continue; fi
  if [ "$conclusion" = "success" ]; then
    echo "sha_head"
  fi
  break
done)"
printf '%s' "$last_green"
`,
        { mode: 0o755 }
      );
      const output = execFileSync('bash', [mockScript], { encoding: 'utf8' });
      expect(output).toBe('');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('forbids retired Clerk gates in golden-path-app.spec.ts, billing-checkout.spec.ts, and e2e-helpers.ts REQUIRED_ENV', () => {
    const webRoot = resolve(__dirname, '../../..');
    for (const relPath of [
      'tests/e2e/golden-path-app.spec.ts',
      'tests/e2e/billing-checkout.spec.ts',
    ]) {
      const spec = readFileSync(join(webRoot, relPath), 'utf8');
      expect(spec, relPath).not.toContain('CLERK_TESTING_SETUP_SUCCESS');
      expect(spec, relPath).not.toContain('CLERK_SECRET_KEY');
      expect(spec, relPath).not.toContain('(window as any).Clerk');
    }

    const helpers = readFileSync(
      join(webRoot, 'tests/e2e/helpers/e2e-helpers.ts'),
      'utf8'
    );
    const requiredEnvMatch = helpers.match(
      /export const REQUIRED_ENV = \{[\s\S]*?\} as const;/u
    );
    expect(requiredEnvMatch?.[0]).toBeTruthy();
    expect(requiredEnvMatch?.[0]).not.toContain('CLERK_SECRET_KEY');
    expect(requiredEnvMatch?.[0]).not.toContain(
      'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY'
    );
  });
});
