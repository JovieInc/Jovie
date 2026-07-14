import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, '..', '..', '..', '..', '..');
const workflowPath = resolve(
  repoRoot,
  '.github/workflows/fixed-runner-canary.yml'
);
const actionlintConfigPath = resolve(repoRoot, '.github/actionlint.yaml');

describe('fixed runner canary workflow', () => {
  const workflow = readFileSync(workflowPath, 'utf8');

  it('is manual-only and cannot mutate runner routing', () => {
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).not.toContain('pull_request:');
    expect(workflow).not.toContain('push:');
    expect(workflow).not.toContain('schedule:');
    expect(workflow).not.toContain('CI_FAST_RUNNER');
    expect(workflow).toContain('contents: read');
  });

  it('targets only the distinct fixed runner label', () => {
    const actionlintConfig = readFileSync(actionlintConfigPath, 'utf8');

    expect(workflow).toContain(
      'runs-on: [self-hosted, Linux, X64, jovie-fixed]'
    );
    expect(workflow).not.toContain('jovie-eph-isolation');
    expect(actionlintConfig).toContain('- jovie-fixed');
  });

  it('validates disk, toolchain, local actions, and a representative shard', () => {
    expect(workflow).toContain('15 * 1024 * 1024');
    expect(workflow).toContain('.github/actions/setup-node-pnpm/action.yml');
    expect(workflow).toContain(
      '.github/actions/resolve-neon-database-url/action.yml'
    );
    expect(workflow).toContain('uses: ./.github/actions/setup-node-pnpm');
    expect(workflow).toContain('Expected Node >=22.13 <23');
    expect(workflow).toContain('test "$(pnpm --version)" = "9.15.4"');
    expect(workflow).toContain('--shard=1/5');
    expect(workflow).toContain('--maxWorkers=2');
  });

  it('pins checkout and does not persist credentials', () => {
    expect(workflow).toContain(
      'actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0'
    );
    expect(workflow).toContain('ref: main');
    expect(workflow).toContain('persist-credentials: false');
  });
});
