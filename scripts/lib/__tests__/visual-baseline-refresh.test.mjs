import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load as parseYaml } from 'js-yaml';
import { afterEach, describe, expect, it } from 'vitest';
import {
  applyBaselineRefresh,
  main,
  planBaselineRefresh,
  readSuiteReceipts,
  renderBaselinePrBody,
} from '../visual-baseline-refresh.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const roots = [];

afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

function tempRoot() {
  const root = mkdtempSync(join(tmpdir(), 'visual-baseline-refresh-'));
  roots.push(root);
  return root;
}

function write(path, contents) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

/** One downloaded suite artifact, laid out as the matrix job uploads it. */
function suite(root, receipt, baselines = {}) {
  const dir = join(root, 'suites', `visual-suite-${receipt.suite}-1-1`);
  write(join(dir, 'receipt.json'), JSON.stringify(receipt));
  mkdirSync(join(dir, 'baselines'), { recursive: true });
  for (const [file, contents] of Object.entries(baselines))
    write(join(dir, 'baselines', file), contents);
  return dir;
}

/** @returns {any} parsed workflow YAML */
const workflow = () =>
  parseYaml(
    readFileSync(
      join(REPO_ROOT, '.github/workflows/visual-regression.yml'),
      'utf8'
    )
  );

describe('visual baseline refresh (JOV-12638)', () => {
  it('publishes passing suites and lists the failing ones in one PR body', () => {
    const root = tempRoot();
    const snapshots = join(root, 'snapshots');
    write(join(snapshots, 'auth-visual.spec.ts/old.png'), 'old');
    suite(
      root,
      {
        suite: 'auth-visual',
        spec: 'auth-visual.spec.ts',
        outcome: 'success',
        baselines: true,
      },
      { 'old.png': 'new', 'nested/added.png': 'added' }
    );
    suite(
      root,
      {
        suite: 'chat-visual',
        spec: 'chat-visual.spec.ts',
        outcome: 'failure',
        baselines: false,
      },
      { 'leaked.png': 'must not publish' }
    );
    suite(root, {
      suite: 'profile-visual-audit',
      spec: 'profile-visual-audit.spec.ts',
      outcome: 'success',
      baselines: false,
    });
    mkdirSync(join(root, 'suites', 'visual-suite-broken-1-1'));

    const { receipts, invalid } = readSuiteReceipts(join(root, 'suites'));
    const plan = planBaselineRefresh(receipts, invalid);
    expect(plan.publish.map(r => r.suite)).toEqual(['auth-visual']);
    expect(plan.passed.map(r => r.suite)).toEqual([
      'auth-visual',
      'profile-visual-audit',
    ]);
    expect(plan.failing.map(r => r.suite)).toEqual(['chat-visual']);
    expect(invalid).toEqual(['visual-suite-broken-1-1']);

    expect(applyBaselineRefresh(plan, snapshots).sort()).toEqual([
      'auth-visual.spec.ts/nested/added.png',
      'auth-visual.spec.ts/old.png',
    ]);
    expect(
      readFileSync(join(snapshots, 'auth-visual.spec.ts/old.png'), 'utf8')
    ).toBe('new');
    expect(existsSync(join(snapshots, 'chat-visual.spec.ts'))).toBe(false);

    const body = renderBaselinePrBody({
      plan,
      sha: 'c6de50b74d245a3441ffb9743986a93636a82d8a',
      runUrl: 'https://github.com/JovieInc/Jovie/actions/runs/1',
    });
    expect(body).toContain('triggered by c6de50b7');
    expect(body).toContain('Refreshed suites:\n- `auth-visual.spec.ts`');
    expect(body).toContain('- `chat-visual.spec.ts` (failure)');
    expect(body).toContain(
      '- `visual-suite-broken-1-1` (no readable suite receipt)'
    );
    expect(body).not.toContain('profile-visual-audit');
  });

  it('refuses receipts and baselines that could write outside the spec directory', () => {
    const root = tempRoot();
    suite(root, {
      suite: '../escape',
      spec: 'auth-visual.spec.ts',
      outcome: 'success',
      baselines: true,
    });
    suite(root, {
      suite: 'auth-visual',
      spec: '../../etc.spec.ts',
      outcome: 'success',
      baselines: true,
    });
    const { receipts, invalid } = readSuiteReceipts(join(root, 'suites'));
    expect(receipts).toEqual([]);
    expect(invalid).toHaveLength(2);

    const other = tempRoot();
    const dir = suite(
      other,
      {
        suite: 'admin-visual-regression',
        spec: 'admin-visual-regression.spec.ts',
        outcome: 'success',
        baselines: true,
      },
      { 'notes.md': 'not a baseline' }
    );
    const plan = planBaselineRefresh(
      readSuiteReceipts(join(other, 'suites')).receipts
    );
    expect(() => applyBaselineRefresh(plan, join(other, 'snapshots'))).toThrow(
      /non-png/
    );
    rmSync(join(dir, 'baselines', 'notes.md'));
    symlinkSync('/etc/hostname', join(dir, 'baselines', 'link.png'));
    expect(() => applyBaselineRefresh(plan, join(other, 'snapshots'))).toThrow(
      /symlinked/
    );
  });

  it('writes the PR body from the CLI even when no suite passed', () => {
    const root = tempRoot();
    suite(root, {
      suite: 'visual-regression',
      spec: 'visual-regression.spec.ts',
      outcome: 'skipped',
      baselines: false,
    });
    const bodyFile = join(root, 'body.md');
    const { written } = main(
      [
        '--suites-dir',
        join(root, 'suites'),
        '--snapshot-dir',
        join(root, 'snap'),
        '--body-file',
        bodyFile,
      ],
      { GITHUB_SHA: 'abcdef1234567890' }
    );
    expect(written).toEqual([]);
    const body = readFileSync(bodyFile, 'utf8');
    expect(body).toContain('Refreshed suites:\n- none');
    expect(body).toContain('- `visual-regression.spec.ts` (skipped)');
    expect(() => main(['--suites-dir', root])).toThrow(
      /missing --snapshot-dir/
    );
  });

  it('runs every visual spec as its own fail-fast:false matrix entry with one combined refresh PR', () => {
    const { jobs } = workflow();
    const suites = jobs['visual-regression'];
    expect(suites.strategy['fail-fast']).toBe(false);
    const entries = suites.strategy.matrix.include;
    expect(entries.map(entry => entry.spec)).toEqual([
      'visual-regression.spec.ts',
      'auth-visual.spec.ts',
      'profile-visual-audit.spec.ts',
      'chat-visual.spec.ts',
      'electron-titlebar-geometry.spec.ts',
      'admin-visual-regression.spec.ts',
      'storybook-elevation.spec.ts',
      'storybook-chat-history-switcher.spec.ts',
    ]);
    for (const entry of entries) {
      expect(
        existsSync(join(REPO_ROOT, 'apps/web/tests/e2e', entry.spec))
      ).toBe(true);
      expect(entry.suite).toBe(entry.spec.replace(/\.spec\.ts$/, ''));
    }
    // Capture-only suites never write baselines.
    expect(
      entries.filter(entry => entry.update !== 'true').map(entry => entry.suite)
    ).toEqual(['profile-visual-audit', 'electron-titlebar-geometry']);
    // The whole job never stops on a red suite, and every entry reports.
    expect(suites.if).toContain('!cancelled()');
    const record = suites.steps.find(
      step => step.name === 'Upload suite result'
    );
    expect(record.if).toContain('always()');

    const publish = jobs['publish-baselines'];
    expect(publish.needs).toEqual(['visual-regression']);
    expect(publish.if).toContain('!cancelled()');
    expect(publish.if).toContain("github.ref == 'refs/heads/main'");
    const runs = publish.steps.map(step => step.run ?? '').join('\n');
    expect(runs).toContain('node scripts/lib/visual-baseline-refresh.mjs');
    expect(runs.match(/gh pr create/g)).toHaveLength(1);
    expect(runs).toContain(
      '--body-file "$RUNNER_TEMP/visual-baseline-pr-body.md"'
    );
    expect(JSON.stringify(jobs['approved-homepage-baselines'])).toContain(
      '--grep homepage'
    );
    expect(Object.keys(jobs).at(-1)).toBe('report-scheduled-failure');
  });
});
