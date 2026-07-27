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

function getJobBlock(workflow: string, jobKey: string): string {
  const lines = workflow.split('\n');
  const start = lines.findIndex(line => line === `  ${jobKey}:`);
  expect(start, `Missing workflow job: ${jobKey}`).toBeGreaterThanOrEqual(0);

  const block: string[] = [];
  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index];
    if (index > start && /^  [a-zA-Z0-9_-]+:/.test(line)) break;
    block.push(line);
  }
  return block.join('\n');
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
    const ciFastTypecheck = getJobBlock(workflow, 'ci-fast-typecheck');
    const ciFastRemaining = getJobBlock(workflow, 'ci-fast-remaining');

    expect(pathDetection).toBeGreaterThanOrEqual(0);
    expect(workflow.indexOf('  ci-fast-typecheck:')).toBeGreaterThan(
      pathDetection
    );

    for (const [jobId, job] of [
      ['ci-fast-typecheck', ciFastTypecheck],
      ['ci-fast-remaining', ciFastRemaining],
    ] as const) {
      const canonicalSetup = job.indexOf(
        '- uses: ./.github/actions/setup-node-pnpm'
      );
      const childTsxProbe = job.indexOf(
        '- name: Verify Node and tsx seed-loader compatibility'
      );

      expect(
        canonicalSetup,
        `${jobId} missing canonical setup`
      ).toBeGreaterThanOrEqual(0);
      expect(childTsxProbe, `${jobId} missing Node/tsx probe`).toBeGreaterThan(
        canonicalSetup
      );
      expect(job).toContain(
        'node --import tsx --import ./apps/web/tests/eval/promptfoo/server-only-preload.mjs'
      );
      expect(job).toContain('title=Node/tsx runtime drift');
    }
  });
});
