import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  classifyGreenSourceDraft,
  GREEN_SOURCE_HOLD_LABELS,
  GREEN_SOURCE_MERGE_STATES,
  GREEN_SOURCE_PROTECTED_PRS,
  greenSourceHoldRegex,
  hasGreenSourceHold,
  isProtectedGreenSourcePr,
  selectMissedCohort,
  TIM_HOLD_LABELS,
} from '../auto-ready-green-drafts.mjs';
import {
  filterList,
  triggerNames,
  workflowTriggers,
} from '../workflow-triggers.mjs';
import {
  buildWriterProofReceipt,
  renderWriterProofReceipt,
} from '../writer-owned-pr-promotion.mjs';

const repoRoot = resolve(import.meta.dirname, '../../..');
const fleetScript = readFileSync(
  resolve(repoRoot, 'scripts/auto-ready-green-drafts.sh'),
  'utf8'
);
const writerScript = readFileSync(
  resolve(repoRoot, 'scripts/auto-ready-agent-drafts.sh'),
  'utf8'
);
const workflow = readFileSync(
  resolve(repoRoot, '.github/workflows/auto-ready-agent-drafts.yml'),
  'utf8'
);

const head = 'a'.repeat(40);
const other = 'b'.repeat(40);

function writerBody(
  prNumber = 18001,
  headSha = head,
  writerLogin = 'itstimwhite'
) {
  return renderWriterProofReceipt(
    buildWriterProofReceipt({
      issueId: 'JOV-8355',
      prNumber,
      headSha,
      writerLogin,
      requiredTests: 'passed: managed regression tests',
      reviewSweep: 'complete: review sweep',
      ticketEvidence: 'attached: issue evidence',
      prEvidence: 'attached: current-head evidence',
    })
  );
}

function greenChecks(overrides = []) {
  return [
    { name: 'PR Ready', bucket: 'pass', state: 'SUCCESS' },
    { name: 'Migration Guard', bucket: 'pass', state: 'SUCCESS' },
    { name: 'Fork PR Gate', bucket: 'pass', state: 'SUCCESS' },
    { name: 'PR Size Guard', bucket: 'pass', state: 'SUCCESS' },
    ...overrides,
  ];
}

function draft(overrides = {}) {
  return {
    prNumber: 18001,
    state: 'OPEN',
    draft: true,
    baseRefName: 'main',
    headSha: head,
    mergeable: 'MERGEABLE',
    mergeStateStatus: 'CLEAN',
    labels: [],
    title: 'fix(ci): restore green-source undraft',
    branch: 'cursor/auto-ready-green-drafts-eaa1',
    checks: greenChecks(),
    authorLogin: 'itstimwhite',
    body: writerBody(overrides.prNumber ?? 18001),
    ...overrides,
  };
}

describe('green-source draft classifier', () => {
  it.each([
    [
      'writer-proof-proof-missing',
      { body: 'Final qualification pending; author still working.' },
    ],
    ['writer-proof-head-mismatch', { body: writerBody(18001, other) }],
    [
      'writer-proof-writer-mismatch',
      { body: writerBody(18001, head, 'another-writer') },
    ],
    ['writer-proof-pr-number-mismatch', { body: writerBody(18002) }],
    ['author-unavailable', { authorLogin: undefined }],
  ])('never treats green checks as writer intent: %s', (reason, overrides) => {
    expect(classifyGreenSourceDraft(draft(overrides))).toEqual({
      eligible: false,
      reason,
    });
  });

  it('promotes only an open main draft that is CLEAN with required checks SUCCESS', () => {
    expect(classifyGreenSourceDraft(draft())).toEqual({
      eligible: true,
      reason: 'green-source-clean',
    });
  });

  it('keeps only HOLD #17156 as a numeric exemption', () => {
    expect(GREEN_SOURCE_PROTECTED_PRS).toEqual([17156]);
    expect(isProtectedGreenSourcePr(17156)).toBe(true);
    expect(isProtectedGreenSourcePr(17453)).toBe(false);
    expect(isProtectedGreenSourcePr(17929)).toBe(false);
    expect(
      classifyGreenSourceDraft(
        draft({
          prNumber: 17156,
          labels: ['hold'],
        })
      )
    ).toEqual({
      eligible: false,
      reason: 'protected-pr:17156',
    });
  });

  it('relies on hold labels for open #17929 instead of a numeric exemption', () => {
    expect(
      classifyGreenSourceDraft(draft({ prNumber: 17929, labels: ['hold'] }))
    ).toEqual({
      eligible: false,
      reason: 'held',
    });
    expect(
      classifyGreenSourceDraft(draft({ prNumber: 17929, labels: [] }))
    ).toEqual({
      eligible: true,
      reason: 'green-source-clean',
    });
  });

  it('does not treat merged #17453 as a planted protect exemption', () => {
    expect(
      classifyGreenSourceDraft(draft({ prNumber: 17453, labels: [] }))
    ).toEqual({
      eligible: true,
      reason: 'green-source-clean',
    });
  });

  it.each([
    'hold',
    'gated',
    'incident',
    'security',
    'queue-deferred',
    ...TIM_HOLD_LABELS,
  ])('refuses Tim/machine hold label %s', label => {
    expect(classifyGreenSourceDraft(draft({ labels: [label] }))).toEqual({
      eligible: false,
      reason: 'held',
    });
    expect(hasGreenSourceHold([label])).toBe(true);
  });

  it.each(['human-review-required', 'needs-human', 'no-auto', 'taste'])(
    'ignores the legacy %s label',
    label => {
      expect(
        classifyGreenSourceDraft(draft({ labels: [label] }))
      ).toMatchObject({ eligible: true });
      expect(GREEN_SOURCE_HOLD_LABELS).not.toContain(label);
    }
  );

  it('refuses controlled-proof markers', () => {
    expect(classifyGreenSourceDraft(draft({ labels: ['canary'] }))).toEqual({
      eligible: false,
      reason: 'controlled-proof',
    });
    expect(
      classifyGreenSourceDraft(
        draft({ title: 'fix(ci): [deliberate-red] fixture' })
      )
    ).toEqual({ eligible: false, reason: 'controlled-proof' });
  });

  it.each([
    ['not-draft', { draft: false, isDraft: false }],
    ['base:integration/loop-ci', { baseRefName: 'integration/loop-ci' }],
    ['mergeable:CONFLICTING', { mergeable: 'CONFLICTING' }],
    ['mergeStateStatus:BLOCKED', { mergeStateStatus: 'BLOCKED' }],
    ['mergeStateStatus:UNKNOWN', { mergeStateStatus: 'UNKNOWN' }],
    ['moved-head', { expectedHeadSha: other }],
    ['head-unavailable', { headSha: 'short' }],
    ['checks-unavailable', { checks: undefined }],
    ['state:MERGED', { state: 'MERGED' }],
  ])('fails closed for %s', (reason, overrides) => {
    expect(classifyGreenSourceDraft(draft(overrides))).toEqual({
      eligible: false,
      reason,
    });
  });

  it('fails closed when PR Ready is missing or not successful', () => {
    expect(
      classifyGreenSourceDraft(
        draft({
          checks: greenChecks().filter(check => check.name !== 'PR Ready'),
        })
      )
    ).toEqual({
      eligible: false,
      reason: 'checks:PR Ready (missing)',
    });
    expect(
      classifyGreenSourceDraft(
        draft({
          checks: greenChecks().map(check =>
            check.name === 'PR Ready'
              ? { ...check, bucket: 'fail', state: 'FAILURE' }
              : check
          ),
        })
      )
    ).toMatchObject({
      eligible: false,
    });
    expect(
      classifyGreenSourceDraft(
        draft({
          checks: greenChecks().map(check =>
            check.name === 'PR Ready'
              ? { ...check, bucket: 'pending', state: 'IN_PROGRESS' }
              : check
          ),
        })
      )
    ).toMatchObject({
      eligible: false,
    });
  });

  it('admits UNSTABLE only when the fail-closed blocker scan is empty', () => {
    expect(GREEN_SOURCE_MERGE_STATES).toEqual(['CLEAN', 'UNSTABLE']);
    expect(
      classifyGreenSourceDraft(draft({ mergeStateStatus: 'UNSTABLE' }))
    ).toEqual({ eligible: true, reason: 'green-source-clean' });
    expect(
      classifyGreenSourceDraft(
        draft({
          mergeStateStatus: 'UNSTABLE',
          checks: greenChecks([
            { name: 'parity', bucket: 'fail', state: 'FAILURE' },
          ]),
        })
      )
    ).toMatchObject({ eligible: false, reason: 'checks:parity' });
  });

  it('does not park an otherwise green draft on a stale lane-fix-red', () => {
    expect(GREEN_SOURCE_HOLD_LABELS).not.toContain('lane-fix-red');
    expect(
      classifyGreenSourceDraft(draft({ labels: ['lane-fix-red'] }))
    ).toEqual({
      eligible: true,
      reason: 'green-source-clean',
    });
  });

  it('never undrafts a parked draft or one carrying an admission stop label', () => {
    expect(classifyGreenSourceDraft(draft({ parkedDraft: true }))).toEqual({
      eligible: false,
      reason: 'parked-draft',
    });
    for (const name of [
      'hold',
      'queue-deferred',
      'do-not-merge',
      'queue-poison',
    ]) {
      expect(GREEN_SOURCE_HOLD_LABELS).toContain(name);
      expect(
        classifyGreenSourceDraft(draft({ labels: [{ name }] }))
      ).toMatchObject({ eligible: false, reason: 'held' });
    }
  });

  it('emits a hold regex that matches Tim-hold and machine holds only', () => {
    const re = new RegExp(greenSourceHoldRegex());
    expect(re.test('hold')).toBe(true);
    expect(re.test('tim-hold')).toBe(true);
    expect(re.test('needs-human')).toBe(false);
  });
});

describe('green-source controller contract', () => {
  it('undrafts only and never enrolls or enables auto-merge', () => {
    expect(fleetScript).toContain('gh pr ready "$n" -R "$REPO"');
    expect(fleetScript).toContain('auto-ready-green-drafts.mjs');
    expect(fleetScript).toContain('mergeStateStatus');
    expect(fleetScript).toContain('PR Ready');
    expect(fleetScript).not.toContain('--auto --squash');
    expect(fleetScript).not.toContain('enqueuePullRequest');
    expect(fleetScript).not.toContain('enablePullRequestAutoMerge');
    expect(fleetScript).not.toContain('merge-queue');
    expect(writerScript).not.toContain('auto-ready-green-drafts.mjs');
  });

  it('pins the exact live head and fail-closed restores draft on verification miss', () => {
    expect(fleetScript).toContain('before_mutation="$(read_state "$n"');
    expect(fleetScript).toContain('gh pr ready "$n" -R "$REPO" --undo');
    expect(fleetScript).toContain('17156');
    expect(fleetScript).not.toContain('17453');
    expect(fleetScript).not.toContain('17929');
    expect(fleetScript).toContain(
      'PROTECTED_PRS="$(node "$CLASSIFY_LIB" protected)"'
    );
    expect(fleetScript.indexOf('before_mutation="$(read_state')).toBeLessThan(
      fleetScript.indexOf('gh pr ready "$n" -R "$REPO" >/dev/null')
    );
  });

  it('declares the JOV-INV-022 hop exception for the restored CI wakes', () => {
    expect(workflow).toContain(
      '# controller-hop-exception: jovie-controller-hop/v1'
    );
    expect(workflow).toContain('# accountable-writer: Gem');
    expect(workflow).toContain('# necessary-trust-boundary:');
    expect(workflow).toContain('# removal-trigger:');
    expect(workflow).toContain(
      'never enables auto-merge or enrolls the merge queue'
    );
  });

  it('keeps writer-proof recovery manual-only and wakes green-source from CI events', () => {
    const on = workflowTriggers(workflow);
    expect(triggerNames(on)).toEqual(['workflow_dispatch', 'workflow_run']);
    expect(filterList(on.workflow_run.workflows)).toEqual([
      'Fork PR Gate',
      'PR Size Guard',
      'Source Validation',
    ]);
    expect(filterList(on.workflow_run.types)).toEqual(['completed']);
    expect(workflow).not.toContain('github.event.check_suite');
    expect(workflow).not.toMatch(/^concurrency:/m);
    expect(workflow).toContain(
      'group: auto-ready-green-source-${{ github.event.inputs.pr_number'
    );
    const greenSource = workflow.slice(workflow.indexOf('\n  green-source:'));
    expect(greenSource).toContain('cancel-in-progress: true');
    expect(
      greenSource.indexOf('Debounce repeated source completions')
    ).toBeLessThan(greenSource.indexOf('actions/create-github-app-token@'));
    expect(workflow).toContain('RUN_OFFSET: ${{ github.run_number }}');
    expect(workflow).toContain('scripts/auto-ready-green-drafts.sh');
    expect(workflow).toContain("github.event_name == 'workflow_dispatch'");
    expect(workflow).toContain(
      "github.event.workflow_run.event == 'pull_request'"
    );
    expect(workflow).not.toContain('ready_for_review/CI cascade');
    expect(workflow).not.toContain('secrets.GITHUB_TOKEN');
  });

  it('mints a short-lived Jovie App token for green-source mutations', () => {
    expect(workflow).toContain(
      'actions/create-github-app-token@64ab729a6294000f5aa4a4bc0b73d1f32bc45510'
    );
    expect(workflow).toContain(
      'GH_TOKEN: ${{ steps.app-token.outputs.token }}'
    );
    expect(workflow).toContain('id: green-source');
    expect(workflow).toContain('TARGET_PR');
    expect(workflow).toContain('TARGET_HEAD');
  });
});

function listed(overrides = {}) {
  return {
    number: 20874,
    isDraft: true,
    baseRefName: 'main',
    headRefName: 'codex/some-fix',
    title: 'fix: something',
    labels: [],
    mergeable: 'MERGEABLE',
    mergeStateStatus: 'CLEAN',
    ...overrides,
  };
}

describe('missed-event cohort selection', () => {
  it('selects green-looking main drafts and skips held, protected, proof, ready and red ones', () => {
    const prs = [
      listed({ number: 30 }),
      listed({ number: 31, mergeStateStatus: 'UNSTABLE' }),
      listed({ number: 32, labels: [{ name: 'hold' }] }),
      listed({ number: 17156 }),
      listed({ number: 33, labels: [{ name: 'canary' }] }),
      listed({ number: 34, isDraft: false }),
      listed({ number: 35, mergeStateStatus: 'BLOCKED' }),
      listed({ number: 36, mergeable: 'CONFLICTING' }),
      listed({ number: 37, baseRefName: 'feat/parent' }),
      listed({ number: 38 }),
    ];
    expect(selectMissedCohort(prs, { limit: 10 })).toEqual([30, 31, 38]);
    expect(selectMissedCohort(prs, { limit: 10, skip: 31 })).toEqual([30, 38]);
    expect(selectMissedCohort(prs, { limit: 0 })).toEqual([]);
  });

  it('rotates by run offset so an ineligible head of the list cannot starve the rest', () => {
    const prs = [10, 11, 12, 13].map(number => listed({ number }));
    expect(selectMissedCohort(prs, { limit: 2, offset: 0 })).toEqual([10, 11]);
    expect(selectMissedCohort(prs, { limit: 2, offset: 1 })).toEqual([11, 12]);
    expect(selectMissedCohort(prs, { limit: 2, offset: 7 })).toEqual([13, 10]);
  });
});

describe('green-source shell controller (fake gh)', () => {
  const greenChecksJson = JSON.stringify(greenChecks());

  function runController(snapshot, env = {}) {
    const dir = mkdtempSync(join(tmpdir(), 'green-source-'));
    try {
      const states = Object.fromEntries(
        snapshot.map(pr => [
          String(pr.number),
          {
            data: {
              repository: {
                pullRequest: {
                  isDraft: pr.isDraft,
                  headRefOid: head,
                  headRefName: pr.headRefName,
                  baseRefName: pr.baseRefName,
                  body: pr.body ?? writerBody(pr.number),
                  author: { login: pr.authorLogin ?? 'itstimwhite' },
                  title: pr.title,
                  state: 'OPEN',
                  mergeable: pr.mergeable,
                  mergeStateStatus: pr.mergeStateStatus,
                  labels: { nodes: pr.labels },
                  timelineItems: { nodes: pr.timeline ?? [] },
                },
              },
            },
          },
        ])
      );
      writeFileSync(join(dir, 'snapshot.json'), JSON.stringify(snapshot));
      writeFileSync(join(dir, 'states.json'), JSON.stringify(states));
      writeFileSync(join(dir, 'checks.json'), greenChecksJson);
      const fakeGh = `#!/usr/bin/env bash
set -euo pipefail
D="${dir}"
echo "$1 $2 $3" >> "$D/calls.log"
args=("$@")
jq_expr=""
for ((i=0; i<\${#args[@]}; i++)); do
  if [[ "\${args[$i]}" == "--jq" ]]; then jq_expr="\${args[$((i+1))]}"; fi
done
emit() { if [[ -n "$jq_expr" ]]; then jq -r "$jq_expr"; else cat; fi; }
case "$1 $2" in
  "pr list") cat "$D/snapshot.json" | emit ;;
  "pr checks") cat "$D/checks.json" ;;
  "api graphql")
    n=""
    for a in "$@"; do [[ "$a" == number=* ]] && n="\${a#number=}"; done
    count=0
    [[ -f "$D/reads-$n" ]] && count="$(cat "$D/reads-$n")"
    count=$((count + 1)); echo "$count" > "$D/reads-$n"
    state="$(jq -c --arg n "$n" '.[$n]' "$D/states.json")"
    if [[ "$count" -ge 2 && -n "\${STATE_AFTER_FIRST_READ:-}" ]]; then
      state="$(jq --argjson patch "$STATE_AFTER_FIRST_READ" '.data.repository.pullRequest += $patch' <<<"$state")"
    fi
    emit <<<"$state" ;;
  "pr ready")
    draft=false
    [[ " $* " == *" --undo "* ]] && draft=true
    jq --arg n "$3" --argjson draft "$draft" '.[$n].data.repository.pullRequest.isDraft = $draft' "$D/states.json" > "$D/next.json"
    mv "$D/next.json" "$D/states.json" ;;
  *)
    if [[ "$1" == "api" && "$2" == repos/*/commits/*/pulls ]]; then
      sha="\${2%/pulls}"; sha="\${sha##*/}"
      jq -c --arg sha "$sha" '[.[] | {number, state: "open", base: {ref: .baseRefName}, head: {sha: $sha}}]' "$D/snapshot.json" | emit
    fi ;;
esac
`;
      writeFileSync(join(dir, 'gh'), fakeGh);
      chmodSync(join(dir, 'gh'), 0o755);
      /** @type {NodeJS.ProcessEnv} */
      const spawnEnv = {
        ...process.env,
        PATH: `${dir}:${process.env.PATH}`,
        DRY_RUN: '1',
        MISSED_COHORT: '3',
        RUN_OFFSET: '0',
        TARGET_PR: '',
        TARGET_HEAD: '',
        GH_RETRY_ATTEMPTS: '1',
        STATE_AFTER_FIRST_READ: '',
        ...env,
      };
      if (env.HEAD_PR_CACHE_DIR) {
        const cacheDir = join(dir, env.HEAD_PR_CACHE_DIR);
        mkdirSync(cacheDir, { recursive: true });
        spawnEnv.HEAD_PR_CACHE_DIR = cacheDir;
        if (env.SEED_HEAD_PR && env.TARGET_HEAD) {
          writeFileSync(
            join(cacheDir, String(env.TARGET_HEAD).toLowerCase()),
            `${env.SEED_HEAD_PR}\n`
          );
        }
      }
      delete spawnEnv.SEED_HEAD_PR;
      const result = spawnSync(
        'bash',
        [resolve(repoRoot, 'scripts/auto-ready-green-drafts.sh')],
        {
          encoding: 'utf8',
          env: spawnEnv,
        }
      );
      let calls = [];
      try {
        calls = readFileSync(join(dir, 'calls.log'), 'utf8')
          .split('\n')
          .filter(Boolean);
      } catch {}
      return { ...result, calls };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it('an active author without proof stays draft despite successful checks', () => {
    const result = runController(
      [listed({ body: 'Final qualification pending' })],
      {
        TARGET_PR: '20874',
        TARGET_HEAD: head,
        MISSED_COHORT: '0',
        DRY_RUN: '0',
      }
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('writer-proof-proof-missing');
    expect(result.calls.some(call => call.startsWith('pr ready'))).toBe(false);
  });

  it.each([
    ['a newer head', { headRefOid: other, body: writerBody(20874, other) }],
    ['withdrawn proof', { body: '' }],
    ['a different author', { author: { login: 'another-writer' } }],
  ])('revalidates %s immediately before readiness', (_name, patch) => {
    const result = runController([listed()], {
      TARGET_PR: '20874',
      TARGET_HEAD: head,
      MISSED_COHORT: '0',
      DRY_RUN: '0',
      STATE_AFTER_FIRST_READ: JSON.stringify(patch),
    });
    expect(result.status).toBe(0);
    expect(result.calls.some(call => call.startsWith('pr ready'))).toBe(false);
  });

  it('a writer-qualified exact current head reaches verified ready without queue writes', () => {
    const result = runController([listed()], {
      TARGET_PR: '20874',
      TARGET_HEAD: head,
      MISSED_COHORT: '0',
      DRY_RUN: '0',
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('marked #20874 ready');
    expect(
      result.calls.filter(call => call.startsWith('pr ready'))
    ).toHaveLength(1);
    expect(result.calls.some(call => /enqueue|merge/.test(call))).toBe(false);
  });

  it('evaluates the missed cohort instead of crashing in jq (regression)', () => {
    const result = runController([
      listed({ number: 20874 }),
      listed({ number: 20834, mergeStateStatus: 'UNSTABLE' }),
      listed({ number: 20991, labels: [{ name: 'hold' }] }),
    ]);
    expect(result.stderr).not.toContain('jq: error');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('would mark #20874 ready');
    expect(result.stdout).toContain('would mark #20834 ready');
    expect(result.stdout).not.toContain('#20991');
  });

  it('leaves a draft parked after its last push, and undrafts it after a new push', () => {
    const converted = {
      __typename: 'ConvertToDraftEvent',
      createdAt: '2026-10-13T02:00:00Z',
    };
    const commit = at => ({
      __typename: 'PullRequestCommit',
      commit: { committedDate: at },
    });
    const parked = runController(
      [
        listed({
          number: 21429,
          timeline: [commit('2026-10-13T01:00:00Z'), converted],
        }),
      ],
      { TARGET_PR: '21429', TARGET_HEAD: head, MISSED_COHORT: '0' }
    );
    expect(parked.status).toBe(0);
    expect(parked.stdout).toContain('green-source parked-draft');
    expect(parked.stdout).not.toContain('would mark #21429 ready');
    const pushed = runController(
      [
        listed({
          number: 21429,
          timeline: [converted, commit('2026-10-13T03:00:00Z')],
        }),
      ],
      { TARGET_PR: '21429', TARGET_HEAD: head, MISSED_COHORT: '0' }
    );
    expect(pushed.status).toBe(0);
    expect(pushed.stdout).toContain('would mark #21429 ready');
  });

  it('an event for a ready PR costs one API read and never lists every PR', () => {
    const result = runController([listed({ number: 21261, isDraft: false })], {
      TARGET_PR: '21261',
      TARGET_HEAD: head,
      MISSED_COHORT: '0',
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('green-source not-draft');
    expect(result.calls, result.calls.join('\n')).toHaveLength(1);
    expect(result.calls.join('\n')).not.toContain('pr list');
  });

  it('resolves a head-only event with the commit pulls API, not a PR scan', () => {
    const result = runController([listed({ number: 20783 })], {
      TARGET_HEAD: head,
      MISSED_COHORT: '0',
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('→ #20783');
    expect(result.calls.join('\n')).toContain(`commits/${head}/pulls`);
    expect(result.calls.join('\n')).not.toContain('pr list');
  });

  it('reuses a cached head association and skips the commit pulls read', () => {
    const result = runController([listed({ number: 20783 })], {
      TARGET_HEAD: head,
      MISSED_COHORT: '0',
      HEAD_PR_CACHE_DIR: 'head-prs',
      SEED_HEAD_PR: '20783',
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('→ #20783');
    expect(result.stderr).toContain('head-pr cache hit');
    expect(result.calls.join('\n')).not.toContain(`commits/${head}/pulls`);
  });

  it('bounds a one-draft missed cohort to a single list plus one PR evaluation', () => {
    const result = runController(
      [listed({ number: 1 }), listed({ number: 2 }), listed({ number: 3 })],
      { MISSED_COHORT: '1', RUN_OFFSET: '1' }
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('missed candidate #2');
    expect(result.stdout).not.toContain('#1 ');
    // pr list + (state, checks) twice before the (dry-run) mutation.
    expect(result.calls.length).toBeLessThanOrEqual(5);
  });
});
