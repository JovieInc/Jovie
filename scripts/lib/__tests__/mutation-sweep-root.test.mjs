import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { selectHighRiskSources } from '../mutation-diff.mjs';
import { buildSurvivorIssue } from '../mutation-sweep.mjs';
import {
  harnessArgs,
  reportName,
  resolveSweepRoot,
  rootRelative,
  stateKey,
  verifyCommand,
} from '../mutation-sweep-root.mjs';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');

describe('resolveSweepRoot', () => {
  it('defaults to apps/web with the lib/ and app/api/ includes', () => {
    expect(resolveSweepRoot()).toEqual({
      root: 'apps/web',
      keyPrefix: '',
      harness: 'scripts/mutation-diff.mjs',
      includes: ['lib/', 'app/api/'],
    });
    expect(resolveSweepRoot({ include: 'components/' }).includes).toEqual([
      'components/',
    ]);
  });

  it('selects packages/ui from repo-relative includes, keeping root-relative prefixes', () => {
    const target = resolveSweepRoot({
      include: 'packages/ui/atoms/,packages/ui/confirm-dialog.tsx',
    });
    expect(target).toMatchObject({
      root: 'packages/ui',
      keyPrefix: 'packages/ui/',
      harness: 'scripts/mutation-ui.mjs',
      includes: ['atoms/', 'confirm-dialog.tsx'],
    });
    expect(resolveSweepRoot({ include: 'packages/ui/' }).includes).toEqual([
      '',
    ]);
  });

  it('selects packages/ui from explicit --files alone', () => {
    const target = resolveSweepRoot({ files: 'packages/ui/atoms/kbd.tsx' });
    expect(target.root).toBe('packages/ui');
    expect(target.includes).toEqual(['']);
  });

  it('refuses to mix roots, since state keys and test inventories differ', () => {
    expect(() =>
      resolveSweepRoot({ include: 'lib/,packages/ui/atoms/' })
    ).toThrow(/cannot mix/u);
    expect(() =>
      resolveSweepRoot({
        include: 'packages/ui/',
        files: 'apps/web/lib/a.ts',
      })
    ).toThrow(/cannot mix/u);
  });
});

describe('sweep keys and harness arguments', () => {
  const ui = resolveSweepRoot({ include: 'packages/ui/' });
  const web = resolveSweepRoot();

  it('keys packages/ui by repo path and apps/web by web-relative path', () => {
    expect(stateKey(ui, 'atoms/badge.tsx')).toBe('packages/ui/atoms/badge.tsx');
    expect(rootRelative(ui, 'packages/ui/atoms/badge.tsx')).toBe(
      'atoms/badge.tsx'
    );
    expect(stateKey(web, 'lib/a.ts')).toBe('lib/a.ts');
    expect(rootRelative(web, 'lib/a.ts')).toBe('lib/a.ts');
    expect(() => rootRelative(ui, 'lib/a.ts')).toThrow(/not under/u);
  });

  it('runs each root through its own harness', () => {
    expect(harnessArgs(ui, 'atoms/badge.tsx')).toEqual([
      '--files',
      'packages/ui/atoms/badge.tsx',
    ]);
    expect(harnessArgs(web, 'lib/a.ts')).toEqual([
      '--scope',
      'all',
      '--files',
      'apps/web/lib/a.ts',
      '--max-files',
      '1',
    ]);
    expect(reportName('app/(shell)/x.tsx')).toBe('app_shell_x.tsx.json');
  });

  it('points survivor work items at the right verify command', () => {
    expect(verifyCommand('packages/ui/atoms/badge.tsx')).toBe(
      'node scripts/mutation-ui.mjs --files packages/ui/atoms/badge.tsx'
    );
    expect(verifyCommand('lib/a.ts')).toBe(
      'node scripts/mutation-diff.mjs --scope all --files apps/web/lib/a.ts'
    );
    const issue = buildSurvivorIssue('packages/ui/atoms/badge.tsx', [], {
      score: 90,
      valid: 10,
      tests: [],
    });
    expect(issue.description).toContain(
      '`node scripts/mutation-ui.mjs --files packages/ui/atoms/badge.tsx`'
    );
    expect(issue.description).not.toContain('apps/web/packages');
  });

  it('selects sources under any root, apps/web staying the default', () => {
    const paths = [
      'packages/ui/atoms/badge.tsx',
      'packages/ui/atoms/badge.test.tsx',
      'packages/ui/atoms/badge.stories.tsx',
      'apps/web/lib/a.ts',
    ];
    expect(
      selectHighRiskSources(paths, undefined, {
        prefixes: null,
        root: 'packages/ui',
      })
    ).toEqual(['atoms/badge.tsx']);
    expect(selectHighRiskSources(paths, undefined, { prefixes: null })).toEqual(
      ['lib/a.ts']
    );
  });
});

describe('mutation-sweep CLI on packages/ui', () => {
  it('lists packages/ui modules under their repo-path keys', () => {
    const r = spawnSync(
      process.execPath,
      [
        'scripts/mutation-sweep.mjs',
        '--list-only',
        '--files',
        'packages/ui/atoms/kbd.tsx',
      ],
      { cwd: REPO_ROOT, encoding: 'utf8' }
    );
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('next: packages/ui/atoms/kbd.tsx');
  });
});

describe('Mutation Diff sweep job runs packages/ui on a bounded slice', () => {
  const workflow = readFileSync(
    resolve(REPO_ROOT, '.github/workflows/mutation-diff.yml'),
    'utf8'
  );
  const sweep = workflow.slice(workflow.indexOf('\n  sweep:'));
  const step = sweep.slice(sweep.indexOf('- name: Score the next modules'));
  const uiAt = step.indexOf('mutation-sweep.mjs --include packages/ui/');
  const webAt = step.indexOf('--touch-file');

  it('scores packages/ui before apps/web, in the same state file', () => {
    expect(uiAt).toBeGreaterThan(0);
    expect(webAt).toBeGreaterThan(uiAt);
    const ui = step.slice(uiAt, step.indexOf('|| ui_status=$?'));
    expect(ui).toContain('--state "$state_dir/sweep-state.json"');
    // Only the apps/web sweep drives chaining and baseline proposals.
    expect(ui).not.toContain('--github-output');
    expect(ui).not.toContain('--propose-baseline');
    expect(step.slice(uiAt, webAt)).toContain(
      'git checkout --quiet -- packages/ui'
    );
  });

  it('keeps the worst case within the old budget and the job timeout', () => {
    const minutes = flag =>
      [...step.matchAll(new RegExp(`${flag} (\\d+)`, 'gu'))].map(m =>
        Number(m[1])
      );
    const [uiMax, webMax] = minutes('--max-minutes');
    const [uiFile] = minutes('--file-timeout-minutes');
    // apps/web keeps the sweep's 25-minute per-module default.
    expect(uiMax + uiFile + webMax + 25).toBeLessThanOrEqual(90 + 25);
    expect(sweep).toMatch(/timeout-minutes: 120\n/u);
  });

  it('surfaces a packages/ui failure without skipping the apps/web sweep', () => {
    expect(step).toContain('ui_status=0');
    expect(step).toMatch(/\[ "\$ui_status" -eq 0 \] \|\| \{/u);
    expect(workflow).toContain(
      'packages/ui/reports/mutation packages/ui/.stryker-tmp'
    );
  });
});
