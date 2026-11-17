import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, resolve } from 'node:path';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../../..');
const workflow =
  /** @type {{ jobs: { measure: { steps: { name: string, run: string }[] } } }} */ (
    load(
      readFileSync(resolve(root, '.github/workflows/shipping-slo.yml'), 'utf8')
    )
  );
const step = workflow.jobs.measure.steps.find(
  step => step.name === 'Open latest snapshot PR'
);

function publishSnapshot(lines, unchanged = false) {
  const dir = mkdtempSync(resolve(tmpdir(), 'shipping-slo-snapshot-'));
  const calls = resolve(dir, 'calls.jsonl');
  const stub = `#!/usr/bin/env node
import { appendFileSync } from 'node:fs';
import { basename } from 'node:path';
const tool = basename(process.argv[1]);
const args = process.argv.slice(2);
appendFileSync(process.env.SNAPSHOT_CALLS, JSON.stringify({ tool, args }) + '\\n');
if (tool === 'git' && args[0] === 'diff') {
  if (args.includes('--quiet')) process.exit(process.env.SNAPSHOT_UNCHANGED === 'true' ? 0 : 1);
  process.stdout.write(process.env.SNAPSHOT_LINES + '\\t0\\tdocs/metrics/shipping-slo-latest.json\\n');
}
if (tool === 'gh') process.stdout.write(args[1] === 'view' ? '25827\\n' : 'https://github.com/JovieInc/Jovie/pull/25827\\n');
`;
  try {
    for (const tool of ['git', 'gh', 'python3']) {
      writeFileSync(resolve(dir, tool), stub, { mode: 0o755 });
    }
    const values = {
      'github.run_id': '123',
      'github.run_attempt': '1',
      'github.repository': 'JovieInc/Jovie',
      'github.server_url': 'https://github.com',
    };
    const script = step.run.replace(/\$\{\{ (.*?) \}\}/g, (_, key) => {
      if (!(key in values))
        throw new Error(`Unexpected workflow expression: ${key}`);
      return values[key];
    });
    const result = spawnSync('bash', ['-c', script], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${dir}${delimiter}${process.env.PATH}`,
        GH_TOKEN: 'fixture-token',
        SNAPSHOT_CALLS: calls,
        SNAPSHOT_LINES: String(lines),
        SNAPSHOT_UNCHANGED: String(unchanged),
      },
    });
    expect(result.status, result.stderr).toBe(0);
    return readFileSync(calls, 'utf8')
      .trim()
      .split('\n')
      .map(row => JSON.parse(row));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('shipping SLO snapshot PR publication', () => {
  it.each([300, 1501])(
    'publishes a %i-line data refresh with explicit policy and changelog decisions',
    lines => {
      const calls = publishSnapshot(lines);
      const creations = calls.filter(
        call => call.tool === 'gh' && call.args[1] === 'create'
      );
      expect(creations).toHaveLength(1);
      const args = creations[0].args;
      const labels = args.flatMap((arg, i) =>
        arg === '--label' ? [args[i + 1]] : []
      );
      expect(labels).toContain('data-exception');
      expect(labels.includes('big-pr')).toBe(lines > 1500);
      const body = args[args.indexOf('--body') + 1];
      const decisions = [
        ...body.matchAll(/<!-- customer-changelog\/v1 (.*?) -->/g),
      ];
      expect(decisions).toHaveLength(1);
      expect(JSON.parse(decisions[0][1])).toEqual({ releaseWorthy: false });
      expect(body).toContain(
        'https://github.com/JovieInc/Jovie/actions/runs/123'
      );
    }
  );

  it('creates no PR when the generated snapshots are unchanged', () => {
    const calls = publishSnapshot(0, true);
    expect(
      calls.some(call => call.tool === 'gh' && call.args[1] === 'create')
    ).toBe(false);
    expect(
      calls.some(call => call.tool === 'git' && call.args[0] === 'push')
    ).toBe(false);
  });
});

describe('Company data-exception integration', () => {
  const company =
    /** @type {{ on: { pull_request: { types: string[] } }, jobs: { 'company-guards': { steps: { name?: string, env?: Record<string, string> }[] } } }} */ (
      load(
        readFileSync(
          resolve(root, '.github/workflows/company-guards.yml'),
          'utf8'
        )
      )
    );

  it('supplies native PR labels to the pinned guard', () => {
    const guard = company.jobs['company-guards'].steps.find(
      step => step.name === 'Run guards'
    );
    expect(guard.env.PR_LABELS).toBe(
      '${{ toJSON(github.event.pull_request.labels.*.name) }}'
    );
  });

  it('revalidates the exception when labels are added or removed', () => {
    expect(company.on.pull_request.types).toEqual(
      expect.arrayContaining([
        'opened',
        'synchronize',
        'reopened',
        'labeled',
        'unlabeled',
      ])
    );
  });
});
