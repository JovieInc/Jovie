import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ADMISSION_CRON_DEBT,
  ADMISSION_CRON_DEBT_CEILING,
  admissionSignals,
  baseDebtCounts,
  CRON_ALLOWLIST,
  CRON_ALLOWLIST_CEILING,
  CRON_KEEP_REASONS,
  checkEventDrivenContract,
  EVENT_DRIVEN_INVARIANT_ID,
  EVIDENCE_DRIVEN_WORKFLOWS,
  forLoopAttempts,
  inventoryScheduledWorkflows,
  loadWorkflowFiles,
  POLLING_DEBT,
  POLLING_DEBT_CEILING,
  pollingFindings,
  repoScriptReader,
  SCHEDULE_CLASSES,
} from '../ci-schedule-inventory.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const workflowsDir = resolve(repoRoot, '.github/workflows');

// The CI base this diff is measured against: ci-fast's TURBO_SCM_BASE, else
// the merge-base with origin/main. Null when neither resolves (bare checkout).
function ciBase() {
  if (process.env.TURBO_SCM_BASE) return process.env.TURBO_SCM_BASE;
  const merged = spawnSync('git', ['merge-base', 'HEAD', 'origin/main'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  return merged.status === 0 ? merged.stdout.trim() : null;
}

describe('ci schedule inventory', () => {
  it('requires every cron workflow to declare an allowed clock-class', () => {
    const result = inventoryScheduledWorkflows(loadWorkflowFiles(workflowsDir));
    expect(result.errors).toEqual([]);
    expect(result.rows.length).toBeGreaterThan(0);
    for (const row of result.rows) {
      expect(SCHEDULE_CLASSES).toContain(row.scheduleClass);
    }
  });

  it('keeps broad test, eval, coverage, and security evidence off clocks', () => {
    const files = loadWorkflowFiles(workflowsDir);
    const result = inventoryScheduledWorkflows(files);
    expect(result.errors).toEqual([]);
    for (const path of EVIDENCE_DRIVEN_WORKFLOWS) {
      const workflow = files.find(file => file.path === path);
      expect(workflow, path).toBeDefined();
      expect(workflow.source, path).not.toMatch(/^\s*-\s*cron:/m);
      expect(workflow.source, path).toMatch(
        /^  (?:push|workflow_run|repository_dispatch|deployment_status):/m
      );
    }
  });

  it('reuses exact coverage evidence for Sonar instead of rerunning web coverage', () => {
    const sonar = loadWorkflowFiles(workflowsDir).find(
      file => file.path === '.github/workflows/sonarcloud.yml'
    )?.source;
    expect(sonar).toContain('workflows: [Test Coverage Audit]');
    expect(sonar).toContain(
      'name: coverage-audit-${{ github.event.workflow_run.id }}'
    );
    expect(sonar).toContain('run-id: ${{ github.event.workflow_run.id }}');
    expect(sonar).toMatch(
      /Run apps\/web coverage for manual diagnostics[\s\S]*github\.event_name == 'workflow_dispatch'/
    );
  });

  it('rejects a clock with no class', () => {
    const result = inventoryScheduledWorkflows([
      {
        path: '.github/workflows/example.yml',
        source: 'on:\n  schedule:\n    - cron: "0 0 * * *"\n',
      },
    ]);
    expect(result.errors[0]).toContain('clock-class');
  });

  it('rejects cron or manual-only broad evidence workflows', () => {
    const path = EVIDENCE_DRIVEN_WORKFLOWS[0];
    const scheduled = inventoryScheduledWorkflows([
      {
        path,
        source:
          'on:\n  push:\n  schedule:\n    - cron: "0 0 * * *"\n# clock-class: skip-if-unchanged\n',
      },
    ]);
    expect(scheduled.errors.join('\n')).toContain(
      'broad evidence workflow must not run from a cron schedule'
    );

    const manualOnly = inventoryScheduledWorkflows([
      { path, source: 'on:\n  workflow_dispatch:\n' },
    ]);
    expect(manualOnly.errors).toEqual([
      `${path}: broad evidence workflow requires a causal event trigger`,
    ]);
  });
});

const CRON =
  "on:\n  schedule:\n    - cron: '0 0 * * *'\n# clock-class: skip-if-unchanged\n";
const job = run =>
  `${CRON}jobs:\n  watch:\n    runs-on: ubuntu-latest\n    steps:\n      - run: |\n${run
    .split('\n')
    .map(line => `          ${line}`)
    .join('\n')}\n`;
const empty = {
  cronAllowlist: [],
  cronCeiling: 0,
  admissionDebt: {},
  admissionCeiling: 0,
  pollingDebt: {},
  pollingCeiling: 0,
};

describe('event-driven admission contract (JOV-INV-042)', () => {
  it('holds every live workflow to the frozen cron, admission, and polling debt', async () => {
    const base = ciBase();
    const baseCeilings = base ? await baseDebtCounts(base, repoRoot) : null;
    const result = checkEventDrivenContract(loadWorkflowFiles(workflowsDir), {
      readScript: repoScriptReader(repoRoot),
      baseCeilings,
    });
    expect(result.errors).toEqual([]);
    expect(result.scheduled).toEqual([...CRON_ALLOWLIST].sort());
    // Ceilings are caps: a shorter list passes without a ceiling edit.
    expect(CRON_ALLOWLIST.length).toBeLessThanOrEqual(CRON_ALLOWLIST_CEILING);
    expect(Object.keys(ADMISSION_CRON_DEBT).length).toBeLessThanOrEqual(
      ADMISSION_CRON_DEBT_CEILING
    );
    expect(Object.keys(POLLING_DEBT).length).toBeLessThanOrEqual(
      POLLING_DEBT_CEILING
    );
    for (const [path, entry] of Object.entries(ADMISSION_CRON_DEBT)) {
      expect(CRON_ALLOWLIST, path).toContain(path);
      expect(entry.reason, path).toBeTruthy();
      expect(entry.replacement, path).toBeTruthy();
    }
  });

  it('keeps origin measurement off the lanes control path while blocking scheduled lane commands', () => {
    const path = '.github/workflows/shipping-slo.yml';
    const workflow = loadWorkflowFiles(workflowsDir).find(
      file => file.path === path
    );
    const readScript = repoScriptReader(repoRoot);
    expect(workflow.source).toContain('emit-automation');
    expect(admissionSignals(workflow.source, readScript)).toEqual([]);
    const result = checkEventDrivenContract(
      [
        {
          ...workflow,
          source: `${workflow.source}\nrun: python3 scripts/lanes/lane_runner.py dispatch\n`,
        },
      ],
      { ...empty, cronAllowlist: [path], cronCeiling: 1, readScript }
    );
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('Gem lanes');
    expect(result.errors[0]).toContain('must never run from a schedule');
  });

  it('names the real limit behind every kept clock', () => {
    // Tim 2026-10-12: a clock stays only for a time-bound external fact, a
    // calendar window, a real resource limit, or an owner-tracked
    // replacement still in flight.
    const kinds =
      /^(?:external(?: and calendar)?(?: \([\w-]+\))?|calendar window|AI credits|compute|owner-tracked(?: \([\w -]+\))?): \S/;
    expect(Object.keys(CRON_KEEP_REASONS)).toEqual([...CRON_ALLOWLIST]);
    for (const [path, reason] of Object.entries(CRON_KEEP_REASONS)) {
      expect(reason, path).toMatch(kinds);
      if (reason.startsWith('owner-tracked')) {
        expect(reason, path).toContain('see ADMISSION_CRON_DEBT');
        expect(ADMISSION_CRON_DEBT, path).toHaveProperty([path]);
      }
    }
  });

  it('deliberate red: rejects a new cron and tells the author what to use instead', () => {
    const { errors } = checkEventDrivenContract(
      [{ path: '.github/workflows/new-clock.yml', source: CRON }],
      empty
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(
      '.github/workflows/new-clock.yml: new cron schedule'
    );
    expect(errors[0]).toContain('workflow_run');
    expect(errors[0]).toContain('Gem lanes tick');
    expect(errors[0]).toContain(EVENT_DRIVEN_INVARIANT_ID);
  });

  it('requires a removed cron to delete its entry, with no ceiling edit', () => {
    const stale = checkEventDrivenContract([], {
      ...empty,
      cronAllowlist: ['.github/workflows/gone.yml'],
      cronCeiling: 1,
    });
    expect(stale.errors).toEqual([
      '.github/workflows/gone.yml: no longer has a cron schedule; delete its entry so the debt list shrinks',
    ]);
    // Two cleanups that each lowered a ceiling 3 -> 2 merge into a list of 1:
    // fewer entries than the ceiling is never an error.
    const shrunk = checkEventDrivenContract([], {
      ...empty,
      cronCeiling: 1,
      pollingCeiling: 3,
      admissionCeiling: 2,
    });
    expect(shrunk.errors).toEqual([]);
  });

  it('deliberate red: rejects growing a list back past its size on the CI base', () => {
    const path = '.github/workflows/regrown-clock.yml';
    const { errors } = checkEventDrivenContract([{ path, source: CRON }], {
      ...empty,
      cronAllowlist: [path],
      cronCeiling: 5,
      baseCeilings: { cron: 0 },
    });
    expect(errors.join('\n')).toContain(
      'CRON_ALLOWLIST has 1 entries but its ceiling is 0; the list only shrinks'
    );
    const unreadableBase = checkEventDrivenContract([{ path, source: CRON }], {
      ...empty,
      cronAllowlist: [path],
      cronCeiling: 1,
      baseCeilings: { cron: null },
    });
    expect(unreadableBase.errors).toEqual([]);
  });

  it('reads the debt-list sizes at a git revision', async () => {
    expect(await baseDebtCounts('HEAD', repoRoot)).toEqual({
      cron: expect.any(Number),
      admission: expect.any(Number),
      polling: expect.any(Number),
    });
    expect(
      await baseDebtCounts('0000000000000000000000000000000000000000', repoRoot)
    ).toBeNull();
  });

  it('deliberate red: rejects growing a debt list past its ceiling', () => {
    const path = '.github/workflows/new-clock.yml';
    const { errors } = checkEventDrivenContract([{ path, source: CRON }], {
      ...empty,
      cronAllowlist: [path],
      cronCeiling: 0,
    });
    expect(errors.join('\n')).toContain(
      'CRON_ALLOWLIST has 1 entries but its ceiling is 0; the list only shrinks'
    );
  });

  it('deliberate red: rejects a scheduled admission workflow even on the cron allowlist', () => {
    const path = '.github/workflows/enroll-clock.yml';
    const { errors } = checkEventDrivenContract(
      [{ path, source: job('gh pr merge "$PR" --auto --squash') }],
      { ...empty, cronAllowlist: [path], cronCeiling: 1 }
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(
      'admission/landing workflow (auto-merge or merge) must never run from a schedule'
    );
    expect(errors[0]).toContain(EVENT_DRIVEN_INVARIANT_ID);
  });

  it('classifies admission through the scripts a workflow runs, not finding intake', () => {
    const scripts = {
      'scripts/enroll.mjs':
        'await github.graphql(`mutation { enqueuePullRequest }`)',
      'scripts/lib/linear-issue-intake.mjs': 'issueUpdate(id: $id)',
      'scripts/sync.mjs': 'issueUpdate(id: $id, input: { stateId })',
    };
    const read = path => scripts[path] ?? null;
    expect(admissionSignals('run: node scripts/enroll.mjs', read)).toEqual([
      'merge-queue enqueue/dequeue',
    ]);
    expect(admissionSignals('run: node scripts/sync.mjs', read)).toEqual([
      'Linear issue state mutation',
    ]);
    expect(
      admissionSignals('run: node scripts/lib/linear-issue-intake.mjs', read)
    ).toEqual([]);
    expect(
      admissionSignals('# gh pr ready is only mentioned here', read)
    ).toEqual([]);
    expect(
      admissionSignals('run: gh issue edit 1 --add-label agent-ready', read)
    ).toEqual(['PR or issue label mutation']);
  });

  it('deliberate red: rejects a step that holds a runner polling GitHub state', () => {
    const path = '.github/workflows/poller.yml';
    const { errors } = checkEventDrivenContract(
      [
        {
          path,
          source: job(
            'until [ "$(gh run view 1 --json status -q .status)" = completed ]; do\n  sleep 30\ndone'
          ).replace(CRON, 'on:\n  workflow_dispatch:\n'),
        },
      ],
      empty
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(`${path}#watch: holds a runner polling GitHub`);
    expect(errors[0]).toContain('react to the completion event instead');
    expect(errors[0]).toContain(EVENT_DRIVEN_INVARIANT_ID);
  });

  it('flags open-ended waits and allows a capped retry of one transient call', () => {
    expect(
      pollingFindings({
        run: 'while true; do\n  gh api repos/x/pulls\n  sleep 5\ndone',
      })
    ).toHaveLength(1);
    expect(
      pollingFindings({
        run: 'for _ in $(seq 1 480); do\n  gh api repos/x/actions/runs/1\n  sleep 10\ndone',
      })
    ).toHaveLength(1);
    expect(
      pollingFindings({ run: 'gh run watch "$RUN" --exit-status' })
    ).toEqual(['watches a run or check to completion']);
    expect(
      pollingFindings({
        run: 'sleep "$wait_seconds"\nsha="$(gh api repos/x/commits/main)"',
      })
    ).toEqual([
      'holds the runner in a long sleep before rereading GitHub state',
    ]);
    expect(
      pollingFindings({
        with: {
          script:
            'while (!done) { await github.rest.pulls.get(); await new Promise(r => setTimeout(r, 5000)); }',
        },
      })
    ).toEqual(['polls GitHub state from a github-script loop']);

    expect(
      pollingFindings({
        run: 'for attempt in 1 2 3; do\n  gh api repos/x/pulls && break\n  sleep $((attempt * 5))\ndone',
      })
    ).toEqual([]);
    expect(
      pollingFindings({
        run: 'while (( SECONDS < deadline )); do\n  curl -sf https://registry.npmjs.org/x && break\n  sleep 5\ndone',
      })
    ).toEqual([]);
    expect(pollingFindings({ run: 'gh api repos/x\nsleep 5' })).toEqual([]);
    // A retry helper nested in a shell function is still a bounded retry.
    expect(
      pollingFindings({
        run: 'gh_api() {\n  for attempt in 1 2 3; do\n    gh api "$@" && return 0\n    sleep "$RETRY_SECONDS"\n  done\n  return 1\n}\nsha="$(gh_api repos/x/commits/main)"',
      })
    ).toEqual([]);
  });

  it('counts literal attempts and treats variable loops as open-ended', () => {
    expect(forLoopAttempts('for attempt in 1 2 3; do')).toBe(3);
    expect(forLoopAttempts('for i in {1..5}; do')).toBe(5);
    expect(forLoopAttempts('for _ in $(seq 1 30); do')).toBe(30);
    expect(forLoopAttempts('for attempt in $(seq "$N"); do')).toBeNull();
  });
});
