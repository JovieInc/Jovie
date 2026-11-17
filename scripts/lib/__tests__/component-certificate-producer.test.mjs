import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { snapshotRenderInputs } from '../component-render-inputs.mjs';
import { storyCriterion } from '../component-story-receipts.mjs';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const { load } = createRequire(import.meta.url)('js-yaml');
const workflowText = name =>
  readFileSync(resolve(REPO_ROOT, '.github/workflows', name), 'utf8');
const certificate = load(workflowText('component-certificate.yml'));
const job = certificate.jobs.certify;
const steps = job.steps;
const allowed = (condition, github, result = 'skipped', cancelled = false) =>
  Function(
    'github',
    'contains',
    'fromJSON',
    'needs',
    'cancelled',
    `return (${condition});`
  )(
    github,
    (values, value) => values.includes(value),
    JSON.parse,
    { failed_capture: { result } },
    () => cancelled
  );

describe('component certificate producer completion admission', () => {
  it('refreshes current main after an older trusted producer completes', () => {
    const current = 'a'.repeat(40);
    const producer = 'b'.repeat(40);
    const github = {
      ref: 'refs/heads/main',
      sha: current,
      repository: 'JovieInc/Jovie',
      event_name: 'workflow_run',
      event: {
        workflow_run: {
          conclusion: 'success',
          event: 'push',
          head_branch: 'main',
          head_repository: { full_name: 'JovieInc/Jovie' },
          head_sha: producer,
        },
      },
    };
    const admitted = allowed(job.if, github);
    expect(admitted).toBe(true);
    expect(job.env.CERT_SHA).toBe('${{ inputs.sha || github.sha }}');
  });
  it('refreshes on existing main evidence producers without a self-loop or PR trigger', () => {
    const producerNames = [
      'ci.yml',
      'visual-a11y.yml',
      'mutation-diff.yml',
    ].map(file => load(workflowText(file)).name);
    expect(certificate.on.workflow_run).toEqual({
      workflows: producerNames,
      types: ['completed'],
      branches: ['main'],
    });
    expect(producerNames).not.toContain(certificate.name);
    expect(Object.keys(certificate.on).sort()).toEqual([
      'workflow_dispatch',
      'workflow_run',
    ]);
  });
  it('accounts for one main CI completion plus existing render and mutation producer rates', () => {
    const { workflows } = JSON.parse(
      readFileSync(
        resolve(REPO_ROOT, 'scripts/ci-trigger-registry.json'),
        'utf8'
      )
    );
    // CI's registry total includes merge groups; only its main completions trigger here.
    expect(workflows['component-certificate.yml'].runsPerMergedPr).toBeCloseTo(
      1 +
        workflows['visual-a11y.yml'].runsPerMergedPr +
        workflows['mutation-diff.yml'].runsPerMergedPr,
      3
    );
  });
  it('admits successful same-repository main completions for ancestry validation', () => {
    const mainSha = 'a'.repeat(40);
    const admitted = github => allowed(job.if, github);
    const context = overrides => ({
      ref: 'refs/heads/main',
      sha: mainSha,
      repository: 'JovieInc/Jovie',
      event_name: 'workflow_run',
      event: {
        workflow_run: {
          conclusion: 'success',
          event: 'push',
          head_branch: 'main',
          head_repository: { full_name: 'JovieInc/Jovie' },
          head_sha: mainSha,
          ...overrides,
        },
      },
    });
    for (const event of ['push', 'workflow_dispatch', 'workflow_run'])
      expect(admitted(context({ event }))).toBe(true);
    for (const overrides of [
      { conclusion: 'failure' },
      { conclusion: 'cancelled' },
      { head_branch: 'feature' },
      { head_repository: { full_name: 'fork/Jovie' } },
      { event: 'pull_request' },
      { event: 'pull_request_target' },
    ])
      expect(admitted(context(overrides)), JSON.stringify(overrides)).toBe(
        false
      );
    const unrelated = context({});
    unrelated.event_name = 'pull_request';
    expect(admitted(unrelated)).toBe(false);
    const dispatch = context({ head_sha: 'b'.repeat(40) });
    dispatch.event_name = 'workflow_dispatch';
    expect(admitted(dispatch)).toBe(true);
    dispatch.ref = 'refs/heads/feature';
    expect(admitted(dispatch)).toBe(false);
  });
  it('binds checkout and cancellation to the same SHA, isolating older main completions', () => {
    const source = 'inputs.sha || github.sha';
    expect(job.env.CERT_SHA).toBe(`\${{ ${source} }}`);
    expect(job.concurrency).toEqual({
      group: `component-certificate-\${{ ${source} }}`,
      'cancel-in-progress': true,
    });
    expect(steps.find(step => step.name === 'Checkout').with.ref).toBe(
      '${{ env.CERT_SHA }}'
    );
  });
});

const fixtureRoots = [];
afterEach(() => {
  for (const root of fixtureRoots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
function lineage() {
  const root = mkdtempSync(join(tmpdir(), 'certificate-refresh-'));
  fixtureRoots.push(root);
  const env = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))
    ),
    GIT_AUTHOR_DATE: '2000-01-01T00:00:00Z',
    GIT_COMMITTER_DATE: '2000-01-01T00:00:00Z',
  };
  const git = (args, options = {}) =>
    execFileSync(
      'git',
      [
        '-c',
        'core.hooksPath=/dev/null',
        '-c',
        'user.name=Fixture',
        '-c',
        'user.email=fixture@example.invalid',
        ...args,
      ],
      { cwd: root, env, encoding: 'utf8', ...options }
    ).trim();
  const put = (path, value) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), value);
  };
  const commit = message => {
    git(['add', '.']);
    git(['commit', '--allow-empty', '-qm', message]);
    return git(['rev-parse', 'HEAD']);
  };
  git(['init', '-q', '-b', 'main']);
  put('package.json', '{}');
  put('apps/web/app/globals.css', 'body {color:var(--text-primary)}');
  const producer = commit('capture inputs');
  const captured = snapshotRenderInputs(root).binding;
  put('.github/workflows/unrelated-ci.yml', 'name: CI-only change');
  const target = commit('main advances without render edits');
  git(['update-ref', 'refs/remotes/origin/main', target]);
  const foreign = git(['commit-tree', 'HEAD^{tree}', '-m', 'unrelated root']);
  const gate = (trigger, overrides = {}, failedAdmission = false) =>
    spawnSync(
      'bash',
      [
        '-c',
        failedAdmission
          ? certificate.jobs.failed_capture.steps.find(
              step => step.name === 'Require trusted main ancestry'
            ).run
          : steps.find(step => step.name === 'Require main ancestry').run,
      ],
      {
        cwd: root,
        env: {
          ...env,
          CERT_EVENT_NAME: 'workflow_run',
          CERT_TRIGGER_SHA: trigger,
          CERT_SHA: target,
          ...overrides,
        },
        encoding: 'utf8',
      }
    );
  return { root, producer, target, foreign, captured, put, git, commit, gate };
}

describe('trusted producer lineage before checkout code executes', () => {
  it('keeps an admitted immutable target out of a newer mains cancellation group', () => {
    const f = lineage();
    const newer = f.commit('main advances after admission');
    f.git(['update-ref', 'refs/remotes/origin/main', newer]);
    f.git(['checkout', '-q', f.target]);
    expect(f.gate(f.producer).status).toBe(0);
    expect(f.gate(f.producer, {}, true).status).toBe(0);
    const group = sha =>
      job.concurrency.group.replace(
        /\$\{\{\s*(.*?)\s*\}\}/g,
        (_match, expression) =>
          Function('inputs', 'github', `return (${expression});`)({}, { sha })
      );
    expect(group(f.target)).toBe(`component-certificate-${f.target}`);
    expect(group(f.target)).not.toBe(group(newer));
    const proofCheckout = certificate.jobs.failed_capture.steps[0];
    expect(proofCheckout.with.ref).toBe('${{ github.sha }}');
    expect(job.env.CERT_SHA).toBe('${{ inputs.sha || github.sha }}');
    // The unchanged real delivery-shell advance fixture additionally verifies
    // superseded-main skips POST; source-ordered storage rejects late generations.
  });
  it('allows an ancestor capture to refresh the immutable current target after CI-only advancement', () => {
    const f = lineage();
    expect(f.producer).not.toBe(f.target);
    expect(f.gate(f.producer).status).toBe(0);
    expect(snapshotRenderInputs(f.root).binding).toEqual(f.captured);
    f.put('apps/web/app/globals.css', 'body {color:red}');
    expect(snapshotRenderInputs(f.root).binding.digest).not.toBe(
      f.captured.digest
    );
    // Trigger admission never substitutes for the consumer's independent input check.
  });
  it.each(['foreign', 'missing', 'invalid', 'nonexistent', 'descendant'])(
    'rejects a %s producer before restoring evidence or executing scripts',
    kind => {
      const f = lineage();
      const descendant = f.commit('later descendant');
      f.git(['checkout', '-q', f.target]);
      const trigger =
        kind === 'foreign'
          ? f.foreign
          : kind === 'missing'
            ? ''
            : kind === 'invalid'
              ? 'main; exit 0'
              : kind === 'nonexistent'
                ? 'c'.repeat(40)
                : descendant;
      expect(f.gate(trigger).status).not.toBe(0);
      expect(f.gate(trigger, {}, true).status).not.toBe(0);
      expect(
        steps.indexOf(steps.find(step => step.name === 'Require main ancestry'))
      ).toBe(1);
    }
  );
  it('retains explicit dispatch ancestry and rejects mismatched or unmerged targets', () => {
    const f = lineage();
    expect(f.gate('', { CERT_EVENT_NAME: 'workflow_dispatch' }).status).toBe(0);
    expect(f.gate(f.producer, { CERT_SHA: f.producer }).status).not.toBe(0);
    f.git(['checkout', '-q', f.foreign]);
    expect(
      f.gate('', { CERT_EVENT_NAME: 'workflow_dispatch', CERT_SHA: f.foreign })
        .status
    ).not.toBe(0);
  });
});

describe('admitted capture freshness remains independent', () => {
  it('keeps admitted PASS and FAIL observations bound to current source, mode, and render inputs', () => {
    const sourceHash = 'd'.repeat(64);
    for (const status of ['pass', 'fail']) {
      const f = lineage();
      const a11y = { status, sourceHash, renderInputs: f.captured };
      const evidence = { a11y, renderInputs: f.captured };
      expect(
        storyCriterion('a11y', evidence, sourceHash, '').criterion.status
      ).toBe(status);
      expect(
        storyCriterion('a11y', evidence, 'e'.repeat(64), '').criterion.status
      ).toBe('unknown');
      a11y.renderInputs = { ...f.captured, mode: 'storybook-live-cert' };
      expect(
        storyCriterion('a11y', evidence, sourceHash, '').criterion.status
      ).toBe('unknown');
      a11y.renderInputs = f.captured;
      f.put('apps/web/app/globals.css', `body {color:${status}}`);
      evidence.renderInputs = snapshotRenderInputs(f.root).binding;
      expect(
        storyCriterion('a11y', evidence, sourceHash, '').criterion.status
      ).toBe('unknown');
    }
  });
});
