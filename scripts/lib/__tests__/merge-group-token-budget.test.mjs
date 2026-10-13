import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';

// Every repo workflow shares one GITHUB_TOKEN REST bucket (1,000 calls/h per
// repo), and merge-group rebuilds multiply each call. This ledger is the
// complete list of ci.yml steps that receive the token, with the REST calls
// each one spends in a green merge group. A new token-bearing step fails here
// until it is classified, so per-group cost cannot grow unnoticed.
//
// Git fetches authenticated with the token are git protocol traffic, not REST
// API calls, so `git-auth` steps cost nothing against the bucket.
const ROOT = resolve(import.meta.dirname, '../../..');
const CI = /** @type {{ jobs: Record<string, any> }} */ (
  load(readFileSync(resolve(ROOT, '.github/workflows/ci.yml'), 'utf8'))
);
const FAIL_FAST_STEP = 'Post a failing PR Ready on the combined head';

/**
 * kind:
 * - git-auth: token only authenticates git fetches.
 * - off: never runs in a merge group (push/dispatch-only or disabled var).
 * - path-gated: runs only for DB/schema groups.
 * - skipped-in-merge-group: the script returns before any API read.
 * - owned: REST reads owned by another lane, budgeted separately.
 * - on-rebuild: spends calls only when a superseded run exists.
 * @type {Record<string, { kind: string, greenGroupCalls: number }>}
 */
const LEDGER = {
  'ci-merge-group-workspace/Compare verified constituent dependency digests': {
    kind: 'off',
    greenGroupCalls: 0,
  },
  'main-queue-provenance/Resolve exact queue provenance once': {
    kind: 'off',
    greenGroupCalls: 0,
  },
  'ci-unit-runner-route/Query exact runner heartbeat': {
    kind: 'off',
    greenGroupCalls: 0,
  },
  'ci-merge-group-admission/Require live queue membership and external admission checks':
    // scripts/lib/merge-group-admission.mjs (machinery) owns this budget.
    { kind: 'owned', greenGroupCalls: 0 },
  'ci-merge-group-supersede/Cancel older runs of the same queued PR': {
    // Lists runs with the Jovie Bot token; one cancel per superseded run.
    kind: 'on-rebuild',
    greenGroupCalls: 0,
  },
  'ci-fast-remaining/Start base-branch history fetch': {
    kind: 'git-auth',
    greenGroupCalls: 0,
  },
  'ci-fast-remaining/Decide structural lane': {
    kind: 'git-auth',
    greenGroupCalls: 0,
  },
  'ci-fast-remaining/Run structural ci-fast lane': {
    kind: 'git-auth',
    greenGroupCalls: 0,
  },
  'ci-profile-admission-browser/Fetch base-branch history': {
    kind: 'git-auth',
    greenGroupCalls: 0,
  },
  'ci-fast-structural-python/Start base-branch history fetch': {
    kind: 'git-auth',
    greenGroupCalls: 0,
  },
  'ci-fast-structural-python/Decide structural lane': {
    kind: 'git-auth',
    greenGroupCalls: 0,
  },
  'ci-fast-structural-python/Run structural pytest shards': {
    kind: 'git-auth',
    greenGroupCalls: 0,
  },
  'ci-fast-structural-web/Start base-branch history fetch': {
    kind: 'git-auth',
    greenGroupCalls: 0,
  },
  'ci-fast-structural-web/Decide structural lane': {
    kind: 'git-auth',
    greenGroupCalls: 0,
  },
  'ci-fast-structural-web/Run structural web commands': {
    kind: 'git-auth',
    greenGroupCalls: 0,
  },
  'neon-db/Verify shared Neon branch admission before publish': {
    kind: 'path-gated',
    greenGroupCalls: 0,
  },
  'drizzle-migration-guard/Run Migration Guard': {
    kind: 'path-gated',
    greenGroupCalls: 0,
  },
  'ci-exact-head-coverage-shard/Fetch base-branch history': {
    kind: 'git-auth',
    greenGroupCalls: 0,
  },
  'ci-exact-head-coverage/Fetch base-branch history': {
    kind: 'git-auth',
    greenGroupCalls: 0,
  },
  'security-gate/Report-only security gate': {
    kind: 'skipped-in-merge-group',
    greenGroupCalls: 0,
  },
  'main-release-ready/Resolve sealed product-lane release routing': {
    kind: 'off',
    greenGroupCalls: 0,
  },
};
const MAX_GREEN_GROUP_CALLS = 5;

function tokenSteps() {
  const steps = [];
  for (const [job, definition] of Object.entries(CI.jobs)) {
    for (const step of definition.steps ?? []) {
      const exposed = JSON.stringify([step.env ?? {}, step.with ?? {}]);
      if (!/github\.token|GITHUB_TOKEN/.test(exposed)) continue;
      steps.push({ key: `${job}/${step.name ?? step.uses}`, job, step });
    }
  }
  return steps;
}

describe('ci.yml merge-group GITHUB_TOKEN budget', () => {
  it('classifies every token-bearing step except failure-only ejection', () => {
    const steps = tokenSteps().filter(
      ({ step }) => step.name !== FAIL_FAST_STEP
    );
    expect(steps.map(({ key }) => key).sort()).toEqual(
      Object.keys(LEDGER).sort()
    );
  });

  it('keeps a green merge group within the REST budget', () => {
    const total = Object.values(LEDGER).reduce(
      (sum, entry) => sum + entry.greenGroupCalls,
      0
    );
    expect(total).toBeLessThanOrEqual(MAX_GREEN_GROUP_CALLS);
  });

  it('spends the ejection call only after a lane failure', () => {
    const ejectors = tokenSteps().filter(
      ({ step }) => step.name === FAIL_FAST_STEP
    );
    expect(ejectors.length).toBeGreaterThan(0);
    for (const { key, job } of ejectors) {
      // The step-only <lane>-fail-fast job carries the failure gate (#21592).
      expect(CI.jobs[job].if, key).toBe(
        "${{ failure() && github.event_name == 'merge_group' }}"
      );
    }
  });

  it('gates off-merge-group steps by event or a disabled variable', () => {
    const offGates = {
      'ci-merge-group-workspace/Compare verified constituent dependency digests':
        "vars.DEPENDENCY_PARITY_ENFORCED == 'true'",
      'main-queue-provenance/Resolve exact queue provenance once':
        "github.event_name == 'push'",
      'main-release-ready/Resolve sealed product-lane release routing':
        'release_authorized',
    };
    for (const { key, step } of tokenSteps()) {
      if (offGates[key]) expect(step.if, key).toContain(offGates[key]);
    }
    expect(CI.jobs['ci-unit-runner-route'].if).toBe(
      "github.event_name == 'workflow_dispatch'"
    );
    expect(CI.jobs['main-release-ready'].if ?? '').not.toContain(
      "'merge_group'"
    );
  });

  it('uses the token only for git in git-auth shell steps', () => {
    for (const { key, step } of tokenSteps()) {
      if (LEDGER[key]?.kind !== 'git-auth') continue;
      const run = String(step.run ?? '');
      if (run.trim() === 'node scripts/ci-fast-lanes.mjs') continue;
      expect(run, key).not.toMatch(/\bgh\s|\bcurl\b|api\.github\.com|octokit/);
      expect(run, key).toContain('extraheader');
    }
  });

  it('skips the report-only security gate reads in a merge group', async () => {
    const { runSecurityGate } = await import(
      '../../security/security-gate.mjs'
    );
    const requests = [];
    const decision = await runSecurityGate({
      env: {
        GITHUB_EVENT_NAME: 'merge_group',
        GH_TOKEN: 'test-token',
        LINEAR_API_KEY: 'test-key',
        SECURITY_GATE_ENABLED: '',
      },
      fetchImpl: async url => {
        requests.push(String(url));
        throw new Error('unexpected request');
      },
    });
    expect(decision.reason).toBe('merge_group_report_skipped');
    expect(requests).toEqual([]);
  });

  it('makes no REST call when a merge group decides the structural lane', () => {
    const decide = tokenSteps().find(
      ({ key }) => key === 'ci-fast-structural-web/Decide structural lane'
    )?.step.run;
    expect(decide).toBeTruthy();
    const dir = mkdtempSync(join(tmpdir(), 'mg-token-budget-'));
    try {
      const calls = join(dir, 'calls');
      for (const tool of ['gh', 'curl', 'git']) {
        const stub = join(dir, tool);
        writeFileSync(stub, `#!/bin/bash\necho "${tool} $*" >> "${calls}"\n`);
        chmodSync(stub, 0o755);
      }
      writeFileSync(calls, '');
      const output = join(dir, 'output');
      writeFileSync(output, '');
      const script = String(decide).replaceAll(
        '${{ github.event_name }}',
        'merge_group'
      );
      const result = spawnSync('bash', ['-euo', 'pipefail', '-c', script], {
        env: {
          PATH: `${dir}:${process.env.PATH}`,
          GH_TOKEN: 'test-token',
          GITHUB_OUTPUT: output,
        },
        encoding: 'utf8',
      });
      expect(result.status, result.stderr).toBe(0);
      expect(readFileSync(output, 'utf8')).toContain('skip=false');
      expect(readFileSync(calls, 'utf8')).toBe('');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
