import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { load as parseYaml } from 'js-yaml';
import { afterAll, describe, expect, it } from 'vitest';

// JOV-7707: the PR Ready and Merge Group Ready aggregators are proven by
// executing their shipped shell against needs.* results, so every gate they
// read must block, and no needed job can be dropped from the decision.

type Job = {
  if?: string;
  needs?: string[];
  steps: { name?: string; run?: string }[];
};
const repoRoot = resolve(import.meta.dirname, '../../../../..');
const ci = parseYaml(
  readFileSync(resolve(repoRoot, '.github/workflows/ci.yml'), 'utf8')
) as { jobs: Record<string, Job> };
const summaryDir = mkdtempSync(join(tmpdir(), 'jovie-ready-gates-'));

afterAll(() => rmSync(summaryDir, { recursive: true, force: true }));

type Scenario = {
  results?: Record<string, string>;
  outputs?: Record<string, string>;
};

// Defaults describe a fully selected, admitted, all-green head.
const defaultOutputs: Record<string, string> = {
  'ci-merge-group-admission.admitted': 'true',
  'ci-merge-group-admission.obsolete': 'false',
  'ci-path-changes.is_noop_merge_group': 'false',
  'ci-path-changes.blog_content_only': 'false',
  'ci-path-changes.selected_lanes': 'ios,mac,web,operations,cross-product',
};
const defaultResults: Record<string, string> = {
  // Content-only qualification runs only for blog-only heads.
  'ci-blog-content': 'skipped',
};

function runReady(jobId: string, scenario: Scenario = {}) {
  const job = ci.jobs[jobId];
  const script = (job?.steps ?? []).map(step => step.run ?? '').join('\n');
  const rendered = script.replace(
    /\$\{\{\s*([^}]+?)\s*\}\}/g,
    (_match, expression: string) => {
      const result = expression.match(/^needs\.([\w-]+)\.result$/);
      if (result?.[1])
        return (
          scenario.results?.[result[1]] ??
          defaultResults[result[1]] ??
          'success'
        );
      const output = expression.match(/^needs\.([\w-]+)\.outputs\.(\w+)$/);
      if (output?.[1] && output[2]) {
        const key = `${output[1]}.${output[2]}`;
        return (
          scenario.outputs?.[key] ??
          defaultOutputs[key] ??
          (output[2].startsWith('run_') ? 'true' : '')
        );
      }
      return '';
    }
  );
  return spawnSync('bash', ['-c', rendered], {
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH ?? '',
      GITHUB_STEP_SUMMARY: join(summaryDir, `${jobId}.md`),
      NODE_ENV: 'test',
    },
  });
}

const referencedResults = (jobId: string) => [
  ...new Set(
    [
      ...(ci.jobs[jobId]?.steps ?? [])
        .map(step => step.run ?? '')
        .join('\n')
        .matchAll(/needs\.([\w-]+)\.(?:result|outputs)/g),
    ].map(match => match[1] ?? '')
  ),
];

describe.each([
  ['ci-pr-ready', "github.event_name == 'pull_request'"],
  ['ci-merge-group-ready', "github.event_name == 'merge_group'"],
])('%s aggregator', (jobId, event) => {
  const job = ci.jobs[jobId] as Job;

  it('always runs for its event and reads exactly the jobs it needs', () => {
    expect(job.if).toContain('always()');
    expect(job.if).toContain(event);
    expect(referencedResults(jobId).sort()).toEqual(
      [...(job.needs ?? [])].sort()
    );
  });

  it('passes a fully selected all-green head', () => {
    const result = runReady(jobId);
    expect(result.status, result.stdout + result.stderr).toBe(0);
  });

  it('blocks when any needed job fails or is cancelled', () => {
    for (const need of job.needs ?? [])
      for (const outcome of ['failure', 'cancelled']) {
        const result = runReady(jobId, { results: { [need]: outcome } });
        expect(result.status, `${need}=${outcome}`).not.toBe(0);
      }
  });
});

describe('ci-pr-ready source lane', () => {
  it('keeps merge-group integration evidence off the source PR gate', () => {
    expect(ci.jobs['ci-pr-ready']?.needs).not.toEqual(
      expect.arrayContaining(['ci-build-layout'])
    );
    for (const heavy of [
      'ci-a11y',
      'ci-layout-guard',
      'ci-build-layout',
      'ci-build-ovie',
      'ci-typecheck-ovie',
      'ci-storybook-surfaces',
    ])
      expect(ci.jobs['ci-pr-ready']?.needs, heavy).not.toContain(heavy);
  });

  it('treats a skipped visual compare as red on homepage and marketing PRs (JOV-5960)', () => {
    for (const flag of ['run_homepage_visual', 'run_marketing_dom']) {
      const outputs = {
        'ci-path-changes.run_homepage_visual': 'false',
        'ci-path-changes.run_marketing_dom': 'false',
        [`ci-path-changes.${flag}`]: 'true',
      };
      const skipped = runReady('ci-pr-ready', {
        outputs,
        results: { 'ci-visual-snapshot-compare': 'skipped' },
      });
      expect(skipped.status, flag).toBe(1);
      expect(skipped.stdout).toContain('skipped is not green');
    }
    const unrelated = runReady('ci-pr-ready', {
      outputs: {
        'ci-path-changes.run_homepage_visual': 'false',
        'ci-path-changes.run_marketing_dom': 'false',
      },
      results: { 'ci-visual-snapshot-compare': 'skipped' },
    });
    expect(unrelated.status, unrelated.stdout).toBe(0);
  });
});

describe('ci-merge-group-ready combined head', () => {
  const laneGates: [string, string][] = [
    ['ci-unit-tests', 'run_web'],
    ['ci-build-layout', 'run_web'],
    ['ci-build-ovie', 'run_web'],
    ['ci-typecheck-ovie', 'run_web'],
    ['ci-storybook-surfaces', 'run_web'],
    ['ci-ios', 'run_ios'],
    ['ci-macos', 'run_macos'],
    ['ci-cross-product-integration', 'run_cross_product'],
    ['neon-db', 'run_neon'],
    ['ci-promptfoo-evals', 'run_promptfoo_evals'],
    ['ci-golden-eval-set', 'run_golden_eval_set'],
    ['ci-lighthouse-dashboard-pr', 'run_golden_path'],
    ['ci-lighthouse-onboarding-pr', 'run_golden_path'],
  ];

  it('accepts skipped lanes only when their paths were not selected', () => {
    for (const [need, flag] of laneGates) {
      const outputs = { [`ci-path-changes.${flag}`]: 'false' };
      const unselected = runReady('ci-merge-group-ready', {
        outputs,
        results: Object.fromEntries(
          laneGates
            .filter(([, other]) => other === flag)
            .map(([other]) => [other, 'skipped'])
        ),
      });
      expect(unselected.status, `${need} unselected`).toBe(0);
      const ranAnyway = runReady('ci-merge-group-ready', {
        outputs,
        results: { [need]: 'success' },
      });
      expect(ranAnyway.status, `${need} ran unselected`).not.toBe(0);
      const skippedWhenSelected = runReady('ci-merge-group-ready', {
        results: { [need]: 'skipped' },
      });
      expect(skippedWhenSelected.status, `${need} skipped`).not.toBe(0);
    }
  });

  it('neutralizes only an explicitly obsolete group', () => {
    const obsolete = runReady('ci-merge-group-ready', {
      outputs: {
        'ci-merge-group-admission.admitted': 'false',
        'ci-merge-group-admission.obsolete': 'true',
      },
      results: { 'ci-fast': 'cancelled' },
    });
    expect(obsolete.status, obsolete.stdout).toBe(0);
    const undecided = runReady('ci-merge-group-ready', {
      outputs: {
        'ci-merge-group-admission.admitted': 'false',
        'ci-merge-group-admission.obsolete': 'false',
      },
    });
    expect(undecided.status).toBe(1);
  });
});
