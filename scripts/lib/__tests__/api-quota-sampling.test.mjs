import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import {
  collectSamples,
  parseQuotaNotice,
  projectDrain,
  sampleQuota,
  summarizeHeadroom,
  summarizeQuota,
} from '../api-quota-report.mjs';

describe('quota sampling and resource collection', () => {
  it('keeps notices emitted by the always sampler in failed completed runs', () => {
    const samples = collectSamples(['--hours', '1'], {
      now: () => 1800000000000,
      read: path => {
        if (path.includes('/workflows/')) {
          expect(path).toContain('status=completed');
          return {
            workflow_runs: path.includes('pr-fleet-rules.yml')
              ? [{ id: 99, conclusion: 'failure' }]
              : [],
          };
        }
        if (path.includes('/jobs?'))
          return {
            jobs: [{ id: 7, name: 'PR Fleet Rules', conclusion: 'failure' }],
          };
        return [
          {
            title: 'api-quota',
            message:
              'bucket=github-token resource=core remaining=0 limit=5000 used=5000 reset=1800003600 at=1800000000',
          },
        ];
      },
    });
    expect(samples).toHaveLength(1);
    expect(samples[0]).toMatchObject({
      bucket: 'github-token',
      resource: 'core',
      remaining: 0,
    });
  });

  it('collects both sources in every requested hour even when newest runs crowd out older hours', () => {
    const runs = new Map();
    const queries = [];
    const samples = collectSamples(['--hours', '3', '--max-samples', '6'], {
      now: () => 1800010800000,
      read: path => {
        queries.push(path);
        if (path.includes('/workflows/')) {
          const range = new URL(
            `https://api.github.com/${path}`
          ).searchParams.get('created');
          const [from, to] = range.split('..').map(value => Date.parse(value));
          expect(to - from).toBe(3600000);
          const id = runs.size + 1;
          runs.set(id, {
            at: from / 1000 + 1800,
            name: path.includes('pr-fleet-rules')
              ? 'PR Fleet Rules'
              : 'Enqueue green PRs',
          });
          return { workflow_runs: [{ id }] };
        }
        const id = Number(path.match(/\/(\d+)\//)[1]);
        const run = runs.get(id);
        if (path.includes('/jobs?'))
          return { jobs: [{ id, name: run.name, conclusion: 'success' }] };
        return [
          {
            title: 'api-quota',
            message: `bucket=github-token remaining=100 limit=1000 used=900 reset=${run.at + 1800} at=${run.at}`,
          },
        ];
      },
    });
    expect(queries.filter(path => path.includes('/workflows/'))).toHaveLength(
      6
    );
    const windows = summarizeHeadroom(samples);
    expect(windows).toHaveLength(3);
    expect(windows.map(row => row.samples)).toEqual([2, 2, 2]);
    expect(windows.map(row => row.minRemaining)).toEqual([100, 100, 100]);
  });

  it('runs the workflow sampler with one shared-client read and survives command and JSON failures', () => {
    const root = resolve(import.meta.dirname, '../../..');
    const workflow =
      /** @type {{ jobs: { fleet: { steps: Array<{ name?: string, if?: string, run: string, 'continue-on-error'?: boolean }> } } }} */ (
        load(
          readFileSync(
            resolve(root, '.github/workflows/pr-fleet-rules.yml'),
            'utf8'
          )
        )
      );
    const step = workflow.jobs.fleet.steps.find(
      step => step.name === 'Sample API quota'
    );
    expect(step.if).toBe('always()');
    expect(step['continue-on-error']).toBeUndefined();
    const dir = mkdtempSync(resolve(tmpdir(), 'quota-workflow-'));
    try {
      const calls = resolve(dir, 'calls');
      writeFileSync(
        resolve(dir, 'gh'),
        `#!${process.execPath}
const fs = require('node:fs');
fs.appendFileSync(process.env.QUOTA_TEST_CALLS, JSON.stringify(process.argv.slice(2)) + '\\n');
if (process.env.QUOTA_TEST_MODE === 'error') { console.error('fixture sensitive diagnostic'); process.exit(1); }
if (process.env.QUOTA_TEST_MODE === 'malformed') { console.log('not JSON'); process.exit(0); }
console.log(JSON.stringify({resources: Object.fromEntries(['core','graphql','search'].map(resource => [resource, {remaining: 0, limit: 5000, used: 5000, reset: 1800003600}]))}));
`,
        { mode: 0o755 }
      );
      for (const mode of ['ok', 'error', 'malformed']) {
        writeFileSync(calls, '');
        const output = execFileSync('bash', ['-c', step.run], {
          cwd: root,
          encoding: 'utf8',
          timeout: 20000,
          env: {
            ...process.env,
            PATH: `${dir}:${resolve(process.execPath, '..')}:${process.env.PATH}`,
            LANES_STATE: resolve(dir, mode),
            GH_TOKEN: 'quota-fixture-token',
            QUOTA_TEST_CALLS: calls,
            QUOTA_TEST_MODE: mode,
          },
        });
        const requests = readFileSync(calls, 'utf8')
          .trim()
          .split('\n')
          .map(line => JSON.parse(line));
        expect(requests).toHaveLength(1);
        expect(requests[0].filter(arg => arg !== '--include')).toEqual([
          'api',
          'rate_limit',
        ]);
        if (mode === 'ok') {
          expect(
            output
              .trim()
              .split('\n')
              .map(parseQuotaNotice)
              .map(row => row.resource)
          ).toEqual(['core', 'graphql', 'search']);
        } else {
          expect(output.trim()).toBe(
            '::warning::API quota sample unavailable.'
          );
        }
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('samples every resource from one response and handles unavailable telemetry', () => {
    const lines = [];
    let reads = 0;
    sampleQuota({
      read: () => {
        reads++;
        return {
          resources: Object.fromEntries(
            ['core', 'graphql', 'search'].map((resource, index) => [
              resource,
              {
                remaining: index,
                limit: 5000,
                used: 5000 - index,
                reset: 1800003600,
              },
            ])
          ),
        };
      },
      emit: line => lines.push(line),
      now: () => 1800000000000,
    });
    expect(reads).toBe(1);
    expect(lines.map(parseQuotaNotice)).toEqual(
      ['core', 'graphql', 'search'].map((resource, index) => ({
        bucket: 'github-token',
        resource,
        remaining: index,
        limit: 5000,
        used: 5000 - index,
        reset: 1800003600,
        at: 1800000000,
      }))
    );
    for (const read of [
      () => {
        throw new Error('sensitive diagnostic');
      },
      () => ({}),
      () => ({ resources: { core: { remaining: 'invalid' } } }),
    ]) {
      const warnings = [];
      expect(() =>
        sampleQuota({ read, emit: line => warnings.push(line) })
      ).not.toThrow();
      expect(warnings).toEqual(['::warning::API quota sample unavailable.']);
    }
  });

  it('keeps resources separate within the same provider reset window', () => {
    const samples = ['core', 'graphql', 'search'].map((resource, index) =>
      parseQuotaNotice(
        `bucket=github-token resource=${resource} remaining=${index} limit=5000 used=1 reset=1800003600 at=1800000000`
      )
    );
    expect(
      summarizeHeadroom(samples).map(({ bucket, minRemaining }) => ({
        bucket,
        minRemaining,
      }))
    ).toEqual([
      { bucket: 'github-token', minRemaining: 0 },
      { bucket: 'github-token:graphql', minRemaining: 1 },
      { bucket: 'github-token:search', minRemaining: 2 },
    ]);
    expect(summarizeQuota(samples).map(row => row.bucket)).toEqual([
      'github-token',
      'github-token:graphql',
      'github-token:search',
    ]);
    const drainSamples = ['core', 'graphql', 'search'].flatMap(
      (resource, resourceIndex) =>
        [0, 5, 10].map((minute, index) => ({
          bucket: 'github-token',
          resource,
          at: 1800000000 + minute * 60,
          reset: 1800003600,
          remaining: [
            [100, 95, 90],
            [60, 30, 0],
            [30, 30, 30],
          ][resourceIndex][index],
        }))
    );
    expect(
      projectDrain(drainSamples, 1800000600).map(row => row.bucket)
    ).toEqual(['github-token:graphql']);
  });
});
