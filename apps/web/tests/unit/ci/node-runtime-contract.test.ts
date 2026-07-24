import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, '..', '..', '..', '..', '..');
const canonicalNodeVersion = readFileSync(
  resolve(repoRoot, '.nvmrc'),
  'utf8'
).trim();

function read(path: string): string {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

describe('Node runtime contract', () => {
  it('keeps canonical version files and workspace engines aligned', () => {
    expect(canonicalNodeVersion).toBe('22.23.1');
    expect(read('.node-version').trim()).toBe(canonicalNodeVersion);

    const node22OnlyPackagePaths = [
      'package.json',
      'apps/console/package.json',
      'apps/web/package.json',
    ];
    const minimumOnlyPackagePaths = [
      'apps/docs/package.json',
      'apps/should-i-make/package.json',
      'packages/ui/package.json',
    ];

    for (const packagePath of node22OnlyPackagePaths) {
      const packageJson = JSON.parse(read(packagePath)) as {
        engines?: { node?: string };
      };
      expect(packageJson.engines?.node, packagePath).toBe('>=22.23.1 <23');
    }

    for (const packagePath of minimumOnlyPackagePaths) {
      const packageJson = JSON.parse(read(packagePath)) as {
        engines?: { node?: string };
      };
      expect(packageJson.engines?.node, packagePath).toBe('>=22.23.1');
    }
  });

  it('uses .nvmrc for reusable and standalone workflow setup', () => {
    const setupFiles = [
      '.github/actions/setup-node-pnpm/action.yml',
      '.github/workflows/agent-pipeline.yml',
      '.github/workflows/merge-queue-autoenroll.yml',
      '.github/workflows/pr-conflict-handler.yml',
    ];

    for (const setupFile of setupFiles) {
      const contents = read(setupFile);
      expect(contents, setupFile).toContain("node-version-file: '.nvmrc'");
      expect(contents, setupFile).not.toMatch(
        /node-version:\s*['"]?22(?:\.|['"\n])/
      );
    }

    expect(read('.github/workflows/agent-pipeline.yml')).toMatch(
      /sparse-checkout: \|\n\s+\.nvmrc\n[\s\S]*?node-version-file: '\.nvmrc'/
    );
  });

  it('checks seed-loader compatibility after canonical setup without delaying path detection', () => {
    const workflow = read('.github/workflows/ci.yml');
    const pathDetection = workflow.indexOf(
      '- name: Detect path changes for all job types'
    );
    const tsxProbe = workflow.indexOf(
      '- name: Verify Node and tsx seed-loader compatibility'
    );
    const ciFastSetup = workflow.indexOf(
      '- uses: ./.github/actions/setup-node-pnpm',
      workflow.indexOf('  ci-fast:')
    );

    const firstCanonicalSetup = workflow.indexOf(
      '- uses: ./.github/actions/setup-node-pnpm'
    );

    expect(pathDetection).toBeGreaterThanOrEqual(0);
    expect(firstCanonicalSetup).toBeGreaterThan(pathDetection);
    expect(tsxProbe).toBeGreaterThan(ciFastSetup);
    expect(workflow).toContain(
      'node --import tsx --import ./apps/web/tests/eval/promptfoo/server-only-preload.mjs'
    );
    expect(workflow).toContain('title=Node/tsx runtime drift');
  });
});
