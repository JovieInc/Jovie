import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { MERGE_GROUP_REQUIRED_LANES } from '../merge-group-required-lanes.mjs';

const ROOT = resolve(import.meta.dirname, '../../..');
const CI_TEXT = readFileSync(resolve(ROOT, '.github/workflows/ci.yml'), 'utf8');
const CI = /** @type {{ jobs: Record<string, any> }} */ (load(CI_TEXT));
const CANCEL = load(
  readFileSync(
    resolve(ROOT, '.github/workflows/merge-group-fail-fast.yml'),
    'utf8'
  )
);

describe('merge-group required lanes cancel only their own run', () => {
  it('posts no early PR Ready failure status', () => {
    expect(CI_TEXT).not.toContain('ejected before the slowest lane');
    expect(
      Object.keys(CI.jobs).filter(job => job.endsWith('-fail-fast'))
    ).toEqual([]);
  });

  it('leaves statuses: write off every ci.yml job', () => {
    const writers = Object.entries(CI.jobs).filter(
      ([, job]) => (job.permissions ?? {}).statuses === 'write'
    );
    expect(writers).toEqual([]);
  });

  it('pins the failure-hold lane manifest to every PR Ready dependency and REST job name', () => {
    const lanes = CI.jobs['ci-merge-group-ready'].needs;
    expect(Object.keys(MERGE_GROUP_REQUIRED_LANES)).toEqual(lanes);
    for (const lane of lanes)
      expect(MERGE_GROUP_REQUIRED_LANES[lane]).toBe(CI.jobs[lane].name);
  });

  it('wires each required lane to its own event-driven cancel companion', () => {
    const lanes = CI.jobs['ci-merge-group-ready'].needs;
    expect(
      Object.keys(CI.jobs)
        .filter(id => id.startsWith('merge-group-cancel-'))
        .sort()
    ).toEqual(lanes.map(lane => `merge-group-cancel-${lane}`).sort());
    for (const lane of lanes) {
      const id = `merge-group-cancel-${lane}`;
      expect(CI.jobs[id], id).toEqual({
        name: `Merge Group Fail Fast (${lane})`,
        needs: [lane],
        if: "${{ github.event_name == 'merge_group' && failure() }}",
        permissions: { actions: 'write', contents: 'read' },
        uses: './.github/workflows/merge-group-fail-fast.yml',
      });
      expect(lanes).not.toContain(id);
    }
  });

  it('cancels only this run via a trusted default-branch helper, never the merge-group head', () => {
    expect(CANCEL.on).toEqual({ workflow_call: null });
    expect(CANCEL.permissions).toEqual({
      actions: 'write',
      contents: 'read',
    });
    expect(Object.keys(CANCEL.jobs)).toEqual(['cancel']);
    expect(CANCEL.jobs.cancel).toEqual({
      'runs-on': 'ubuntu-24.04',
      'timeout-minutes': 5,
      permissions: { actions: 'write', contents: 'read' },
      steps: [
        {
          name: 'Check out the trusted cancel helper',
          uses: 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
          with: {
            ref: '${{ github.event.repository.default_branch }}',
            'sparse-checkout':
              'packages/api-client/cancel-github-run.mjs\n.node-version\n',
            'persist-credentials': false,
          },
        },
        {
          name: 'Set up pinned Node',
          uses: 'actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1',
          with: { 'node-version-file': '.node-version' },
        },
        {
          name: 'Cancel the rest of this merge-group run',
          env: { GH_TOKEN: '${{ secrets.GITHUB_TOKEN }}' },
          run: 'node packages/api-client/cancel-github-run.mjs',
        },
      ],
    });
    const helper = readFileSync(
      resolve(ROOT, 'packages/api-client/cancel-github-run.mjs'),
      'utf8'
    );
    expect(helper).toContain('GITHUB_RUN_ID');
    expect(helper).toContain('/actions/runs/${runId}/cancel');
    expect(helper).not.toMatch(/process\.argv/);
    expect(CI_TEXT).not.toMatch(/gh\s+run\s+cancel/);
    expect(
      readFileSync(
        resolve(ROOT, '.github/workflows/merge-group-fail-fast.yml'),
        'utf8'
      )
    ).not.toMatch(/gh\s+run\s+cancel/);
  });

  it('still fails PR Ready when the merge group is red', () => {
    const ready = CI.jobs['ci-merge-group-ready'];
    expect(ready.if).toBe(
      "${{ always() && github.event_name == 'merge_group' }}"
    );
    expect(ready.name).toBe(
      "${{ github.event_name == 'merge_group' && 'PR Ready' || 'PR Ready (merge-group inactive)' }}"
    );
    expect(String(ready.steps[0].run)).toContain('did not pass');
    expect(String(ready.steps[0].run)).toMatch(
      /if \[\[ "\$result" != "success" \]\]; then\s+echo "::error::[^\n]+did not pass[^\n]+\n\s+exit 1/u
    );
    expect(ready['continue-on-error']).toBeUndefined();
  });

  it('executes the unchanged evaluator: green passes; every failed or cancelled required lane exits 1', () => {
    const ready = CI.jobs['ci-merge-group-ready'];
    const dir = mkdtempSync(resolve(tmpdir(), 'merge-group-ready-red-'));
    const evaluate = (lane, conclusion) => {
      const script = ready.steps[0].run.replace(
        /\$\{\{([^}]+)\}\}/gu,
        (_, expression) => {
          const result = /^needs\.([\w-]+)\.result$/u.exec(expression.trim());
          if (result)
            return result[1] === lane
              ? conclusion
              : result[1] === 'ci-blog-content'
                ? 'skipped'
                : 'success';
          const output = /^needs\.ci-path-changes\.outputs\.(\w+)$/u.exec(
            expression.trim()
          );
          if (output) {
            if (output[1] === 'blog_content_only')
              return String(lane === 'ci-blog-content');
            if (output[1] === 'is_noop_merge_group') return 'false';
            return 'true';
          }
          if (
            expression.trim() ===
            'needs.ci-merge-group-admission.outputs.admitted'
          )
            return 'true';
          return 'false';
        }
      );
      return spawnSync('bash', ['-c', script], {
        encoding: 'utf8',
        env: { ...process.env, GITHUB_STEP_SUMMARY: resolve(dir, 'summary') },
        timeout: 10_000,
      });
    };
    try {
      const green = evaluate('', '');
      expect(green.status, green.stderr || green.stdout).toBe(0);
      for (const lane of ready.needs) {
        for (const conclusion of ['failure', 'cancelled']) {
          const red = evaluate(lane, conclusion);
          expect(
            red.status,
            `${lane}: ${conclusion}\n${red.stdout}\n${red.stderr}`
          ).toBe(1);
          expect(red.stdout).toContain('did not pass');
        }
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
