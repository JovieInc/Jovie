import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load as parseYaml } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import {
  cronGapMinutes,
  triggerNames,
  workflowTriggers,
} from '../../../../../scripts/lib/workflow-triggers.mjs';

const repoRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
  '..'
);
const workflow = readFileSync(
  resolve(repoRoot, '.github/workflows/summer-eve-pin.yml'),
  'utf8'
);

describe('summer eve identity workflow', () => {
  it('stays read-only, rejects deployment pins, and checks source-bound identity', () => {
    // PR-time identity check on every PR (no path filter), an hourly
    // clock and manual dispatch.
    const on = workflowTriggers(workflow);
    expect(triggerNames(on)).toEqual([
      'pull_request',
      'schedule',
      'workflow_dispatch',
    ]);
    expect(on.pull_request).not.toHaveProperty('paths');
    expect(on.pull_request).not.toHaveProperty('paths-ignore');
    expect(cronGapMinutes(on).max).toBeLessThanOrEqual(60);
    expect(workflow).toContain(
      'controller-hop-exception: jovie-controller-hop/v1'
    );
    expect(workflow).toContain('accountable-writer: Summer');
    expect(workflow).toContain('contents: read');
    expect(workflow).not.toContain('contents: write');
    expect(workflow).toContain(
      'node --test scripts/summer-deployment-pin-guard.test.mjs'
    );
    expect(workflow).toContain('pnpm check:summer-eve-pin');
    expect(workflow).not.toContain('vercel env pull');
    expect(workflow).not.toContain('OVIE_SUMMER_EVE_DEPLOYMENT_ORIGIN');
    expect(workflow).not.toContain('OVIE_SUMMER_EVE_EXPECTED_DEPLOYMENT_ID');
    const pkg = JSON.parse(
      readFileSync(resolve(repoRoot, 'package.json'), 'utf8')
    ) as { scripts: Record<string, string> };
    expect(pkg.scripts['check:summer-eve-pin']).toBe(
      'tsx scripts/check-summer-eve-pin.ts'
    );
    for (const use of workflow.match(/uses:\s*\S+/gu) ?? []) {
      if (!use.includes('./')) expect(use).toMatch(/@[0-9a-f]{40}\b/u);
    }
  });

  it('boots the identity runner only for non-PR events or a Summer bridge diff', () => {
    const doc = parseYaml(workflow) as {
      jobs: Record<
        string,
        {
          if?: string;
          needs?: string;
          outputs?: Record<string, string>;
          steps: Array<{ id?: string; run?: string; with?: object }>;
        }
      >;
    };
    const { guard, check } = doc.jobs;
    expect(guard.outputs?.identity).toBe('${{ steps.scope.outputs.identity }}');
    expect(check.needs).toBe('guard');
    expect(check.if).toBe(
      "${{ always() && needs.guard.outputs.identity == 'true' }}"
    );
    expect(guard.steps[0].with).toMatchObject({ 'fetch-depth': 2 });
    const scopeIndex = guard.steps.findIndex(step => step.id === 'scope');
    const pinIndex = guard.steps.findIndex(step =>
      step.run?.includes('summer-deployment-pin-guard')
    );
    // The scope output must exist even when the pin guard goes red.
    expect(scopeIndex).toBeGreaterThan(-1);
    expect(scopeIndex).toBeLessThan(pinIndex);
    const script = guard.steps[scopeIndex].run as string;

    const git = (cwd: string, ...args: string[]) =>
      execFileSync('git', args, { cwd, encoding: 'utf8' });
    const prMerge = (changedPath: string) => {
      const repo = mkdtempSync(join(tmpdir(), 'summer-scope-'));
      git(repo, 'init', '-q', '-b', 'main');
      git(repo, 'config', 'user.email', 'ci@example.invalid');
      git(repo, 'config', 'user.name', 'ci');
      writeFileSync(join(repo, 'README.md'), 'base\n');
      git(repo, 'add', '.');
      git(repo, 'commit', '-qm', 'base');
      git(repo, 'checkout', '-qb', 'pr');
      const file = join(repo, changedPath);
      execFileSync('mkdir', ['-p', dirname(file)]);
      writeFileSync(file, 'change\n');
      git(repo, 'add', '.');
      git(repo, 'commit', '-qm', 'pr');
      git(repo, 'checkout', '-q', 'main');
      writeFileSync(join(repo, 'README.md'), 'base moved\n');
      git(repo, 'commit', '-qam', 'main moved');
      git(repo, 'merge', '-q', '--no-ff', '-m', 'test merge', 'pr');
      return repo;
    };
    const run = (cwd: string, eventName: string) => {
      const output = join(cwd, 'github-output');
      writeFileSync(output, '');
      execFileSync('bash', ['-c', script], {
        cwd,
        env: { ...process.env, EVENT_NAME: eventName, GITHUB_OUTPUT: output },
      });
      return readFileSync(output, 'utf8').trim();
    };

    const unrelated = prMerge('apps/web/components/Thing.tsx');
    expect(run(unrelated, 'pull_request')).toBe('identity=false');
    expect(run(unrelated, 'schedule')).toBe('identity=true');
    expect(run(unrelated, 'workflow_dispatch')).toBe('identity=true');
    expect(
      run(prMerge('apps/web/lib/ovie/summer-origin.ts'), 'pull_request')
    ).toBe('identity=true');
    expect(
      run(prMerge('.github/workflows/summer-eve-pin.yml'), 'pull_request')
    ).toBe('identity=true');

    // A shallow root with no base parent fails closed onto the readback.
    const root = mkdtempSync(join(tmpdir(), 'summer-scope-root-'));
    git(root, 'init', '-q');
    git(root, 'config', 'user.email', 'ci@example.invalid');
    git(root, 'config', 'user.name', 'ci');
    writeFileSync(join(root, 'README.md'), 'only\n');
    git(root, 'add', '.');
    git(root, 'commit', '-qm', 'only');
    expect(run(root, 'pull_request')).toBe('identity=true');
  });
});
