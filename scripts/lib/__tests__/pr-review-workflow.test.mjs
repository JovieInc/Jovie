import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');

describe('pr-review workflow contract', () => {
  const workflow = readFileSync(
    resolve(REPO_ROOT, '.github/workflows/pr-review.yml'),
    'utf8'
  );

  it('runs trusted main code after PR CI, same-repo only, and ships disabled', () => {
    expect(workflow).toContain(
      'controller-hop-exception: jovie-controller-hop/v1'
    );
    expect(workflow).toContain("vars.PR_REVIEW_ENABLED == 'true'");
    expect(workflow).toContain(
      "github.event.workflow_run.event == 'pull_request'"
    );
    expect(workflow).toContain(
      "github.event.workflow_run.conclusion != 'cancelled'"
    );
    expect(workflow).toContain(
      'github.event.workflow_run.head_repository.full_name == github.repository'
    );
    expect(workflow).toContain('ref: main');
    expect(workflow).toContain('persist-credentials: false');
    expect(workflow).toContain('runs-on: ubuntu-latest');
  });

  it('wakes from a producer that actually validates pull requests', () => {
    const { load } = createRequire(import.meta.url)('js-yaml');
    const review = load(workflow);
    const producer = load(
      readFileSync(
        resolve(REPO_ROOT, '.github/workflows/source-validation.yml'),
        'utf8'
      )
    );
    expect(review.on.workflow_run.workflows).toContain(producer.name);
    expect(producer.on.pull_request).toBeDefined();
    expect(review.jobs.review.if).toContain(
      "github.event.workflow_run.event == 'pull_request'"
    );
  });

  it('never gets write access, never posts, never executes PR code', () => {
    expect(workflow).not.toMatch(/:\s*write\b/);
    expect(workflow).toContain('permissions: {}');
    expect(workflow).not.toMatch(
      /pull_request_target|createComment|createReview|gh pr/
    );
    expect(workflow).not.toMatch(
      /ref:\s*\$\{\{\s*github\.event\.workflow_run\.head/
    );
    expect(workflow).not.toContain('pull_requests[0].head');
  });

  it('reads only the main learning publisher and supplies its optional ledger to the router', () => {
    const { load } = createRequire(import.meta.url)('js-yaml');
    const steps = load(workflow).jobs.review.steps;
    const download = steps.find(
      step => step.name === 'Download learned model outcomes'
    );
    const review = steps.find(step => step.name === 'Run advisory review');
    expect(download.continue_on_error ?? download['continue-on-error']).toBe(
      true
    );
    expect(review.env.PR_REVIEW_OUTCOMES).toBe(
      '${{ runner.temp }}/outcomes/model-outcomes.json'
    );
    const root = mkdtempSync(join(tmpdir(), 'review-outcomes-workflow-'));
    const calls = join(root, 'calls.jsonl');
    try {
      writeFileSync(
        join(root, 'gh'),
        `#!/usr/bin/env node\nconst fs=require('node:fs');const a=process.argv.slice(2);fs.appendFileSync(${JSON.stringify(calls)},JSON.stringify(a)+'\\n');if(a[1]==='list')process.stdout.write(process.env.TEST_RUN_ID);\n`
      );
      chmodSync(join(root, 'gh'), 0o755);
      for (const runId of ['123', '', 'unknown']) {
        writeFileSync(calls, '');
        const result = spawnSync(
          'bash',
          ['-e', '-o', 'pipefail', '-c', download.run],
          {
            encoding: 'utf8',
            env: {
              ...process.env,
              PATH: root + delimiter + process.env.PATH,
              GITHUB_REPOSITORY: 'JovieInc/Jovie',
              RUNNER_TEMP: root,
              TEST_RUN_ID: runId,
            },
          }
        );
        expect(result.status).toBe(runId === 'unknown' ? 1 : 0);
        const requests = readFileSync(calls, 'utf8')
          .trim()
          .split('\n')
          .map(line => JSON.parse(line));
        expect(requests[0]).toContain('pr-review-learn.yml');
        expect(
          requests[0].slice(
            requests[0].indexOf('--branch'),
            requests[0].indexOf('--branch') + 2
          )
        ).toEqual(['--branch', 'main']);
        expect(requests).toHaveLength(runId === '123' ? 2 : 1);
        if (runId === '123')
          expect(requests[1]).toEqual([
            'run',
            'download',
            '123',
            '--repo',
            'JovieInc/Jovie',
            '--name',
            'model-outcomes',
            '--dir',
            join(root, 'outcomes'),
          ]);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
