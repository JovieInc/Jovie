import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
import { createGreenSourceController } from './fixtures/green-source-controller.mjs';

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
const S = 'outside-contributor';

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
    { name: 'Company guards', bucket: 'pass', state: 'SUCCESS' },
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
    // Trusted writers ship on green by default; any other author needs proof.
    ['writer-proof-proof-missing', { body: 'Author still working.' }],
    ['writer-proof-head-mismatch', { body: writerBody(18001, other, S) }],
    [
      'writer-proof-writer-mismatch',
      { body: writerBody(18001, head, 'another-writer') },
    ],
    ['writer-proof-pr-number-mismatch', { body: writerBody(18002, head, S) }],
    ['author-unavailable', { authorLogin: undefined }],
  ])('never treats green checks as writer intent: %s', (reason, overrides) => {
    const pr = draft({ authorLogin: S, ...overrides });
    expect(classifyGreenSourceDraft(pr)).toEqual({
      eligible: false,
      reason,
    });
  });

  it.each([
    ['without the marker (REST-opened)', 'Ships when green.'],
    ['with the marker', 'Ships.\n\n<!-- jovie-auto-ready: on-green -->'],
  ])('ships a trusted writer draft on green %s, no receipt', (_n, body) => {
    const verdict = b => classifyGreenSourceDraft(draft({ body: b })).reason;
    expect(verdict(body)).toBe('green-source-clean');
    expect(verdict(`${body}\n<!-- jovie-auto-ready: park -->`)).toBe(
      'writer-parked'
    );
  });

  it('keeps every other gate when a draft ships on green by default', () => {
    const body = 'Opened through the REST API.';
    const refused = (overrides, reason) =>
      expect(classifyGreenSourceDraft(draft({ body, ...overrides }))).toEqual({
        eligible: false,
        reason,
      });
    refused({ authorLogin: 'a-stranger' }, 'writer-proof-proof-missing');
    refused({ parkedDraft: true }, 'parked-draft');
    refused({ labels: ['hold'] }, 'held');
    refused({ baseRefName: 'feat/parent' }, 'base:feat/parent');
    refused({ mergeStateStatus: 'BLOCKED' }, 'mergeStateStatus:BLOCKED');
    refused({ mergeable: 'CONFLICTING' }, 'mergeable:CONFLICTING');
    expect(
      classifyGreenSourceDraft(
        draft({
          body,
          checks: greenChecks().map(c =>
            c.name === 'PR Ready'
              ? { ...c, bucket: 'fail', state: 'FAILURE' }
              : c
          ),
        })
      ).eligible
    ).toBe(false);
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

  it.each(['hold', 'gated', 'incident', 'security', 'queue-deferred'])(
    'refuses machine hold label %s',
    label => {
      expect(classifyGreenSourceDraft(draft({ labels: [label] }))).toEqual({
        eligible: false,
        reason: 'held',
      });
      expect(hasGreenSourceHold([label])).toBe(true);
    }
  );

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
    for (const name of ['hold', 'queue-deferred', 'queue-poison']) {
      expect(GREEN_SOURCE_HOLD_LABELS).toContain(name);
      expect(
        classifyGreenSourceDraft(draft({ labels: [{ name }] }))
      ).toMatchObject({ eligible: false, reason: 'held' });
    }
  });

  it('emits a hold regex that matches machine holds only', () => {
    const re = new RegExp(greenSourceHoldRegex());
    expect(re.test('hold')).toBe(true);
    expect(re.test('tim-hold')).toBe(false);
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
    // Source Validation completed last on 84 of 85 measured PR heads, so it is
    // the only wake (scripts/lib/__tests__/wake-fanout-contract.test.mjs).
    expect(filterList(on.workflow_run.workflows)).toEqual([
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
  const runController = createGreenSourceController({
    repoRoot,
    head,
    writerBody,
    checks: greenChecks(),
  });

  const ready = {
    TARGET_PR: '20874',
    TARGET_HEAD: head,
    MISSED_COHORT: '0',
    DRY_RUN: '0',
  };
  it('a parked draft stays draft despite successful checks', () => {
    const body = 'Still working.\n<!-- jovie-auto-ready: park -->';
    const result = runController([listed({ body })], ready);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('writer-parked');
    expect(result.calls.some(call => call.startsWith('pr ready'))).toBe(false);
  });

  it.each([
    ['a newer head', { headRefOid: other, body: writerBody(20874, other) }],
    ['a new park marker', { body: '<!-- jovie-auto-ready: park -->' }],
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

  it.each([
    ['a writer-qualified', {}],
    ['an on-green opted-in', { body: '<!-- jovie-auto-ready: on-green -->' }],
  ])(
    '%s exact current head reaches verified ready without queue writes',
    (_n, patch) => {
      const result = runController([listed(patch)], ready);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('marked #20874 ready');
      expect(
        result.calls.filter(call => call.startsWith('pr ready'))
      ).toHaveLength(1);
      expect(result.calls.some(call => /enqueue|merge/.test(call))).toBe(false);
    }
  );

  const botProof = writerBody(20874, head, 'jovie-bot[bot]');
  const botTarget = {
    TARGET_PR: '20874',
    TARGET_HEAD: head,
    MISSED_COHORT: '0',
    DRY_RUN: '0',
  };
  it.each([
    [
      'bare Bot',
      { __typename: 'Bot', login: 'jovie-bot' },
      true,
      'marked #20874 ready',
    ],
    [
      'suffixed Bot',
      { __typename: 'Bot', login: 'jovie-bot[bot]' },
      true,
      'marked #20874 ready',
    ],
    [
      'same-name User',
      { __typename: 'User', login: 'jovie-bot' },
      false,
      'writer-proof-writer-mismatch',
    ],
    [
      'other Bot',
      { __typename: 'Bot', login: 'another-bot' },
      false,
      'writer-proof-writer-mismatch',
    ],
    [
      'missing type',
      { login: 'jovie-bot' },
      false,
      'writer-proof-writer-mismatch',
    ],
    [
      'unknown type',
      { __typename: 'Mannequin', login: 'jovie-bot' },
      false,
      'writer-proof-writer-mismatch',
    ],
    ['missing actor', null, false, 'author-unavailable'],
    [
      'empty Bot',
      { __typename: 'Bot', login: '' },
      false,
      'author-unavailable',
    ],
    [
      'blank Bot',
      { __typename: 'Bot', login: ' \t ' },
      false,
      'author-unavailable',
    ],
    [
      'nonstring Bot',
      { __typename: 'Bot', login: 42 },
      false,
      'author-unavailable',
    ],
  ])(
    'preserves GraphQL actor identity: %s',
    (_name, rawAuthor, ready, reason) => {
      const result = runController(
        [listed({ rawAuthor, body: botProof })],
        botTarget
      );
      expect(result.status).toBe(0);
      expect(result.stdout).toContain(reason);
      expect(
        result.calls.filter(call => call.startsWith('pr ready'))
      ).toHaveLength(ready ? 1 : 0);
      expect(result.calls.some(call => /enqueue|merge/.test(call))).toBe(false);
    }
  );

  it('refuses a Bot-to-User identity change before mutation', () => {
    const result = runController(
      [
        listed({
          rawAuthor: { __typename: 'Bot', login: 'jovie-bot' },
          body: botProof,
        }),
      ],
      {
        ...botTarget,
        STATE_AFTER_FIRST_READ: JSON.stringify({
          author: { __typename: 'User', login: 'jovie-bot' },
        }),
      }
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('writer-proof-writer-mismatch');
    expect(result.calls.some(call => call.startsWith('pr ready'))).toBe(false);
  });

  it.each(['', writerBody(20874, other, 'renovate[bot]')])(
    'keeps strict proof required for an untrusted Bot',
    body => {
      const result = runController(
        [
          listed({
            rawAuthor: { __typename: 'Bot', login: 'renovate' },
            body,
          }),
        ],
        botTarget
      );
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('writer-proof-');
      expect(result.calls.some(call => call.startsWith('pr ready'))).toBe(
        false
      );
    }
  );

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

  it('recovers a missed draft on a later page without exceeding GraphQL resources', () => {
    const result = runController(
      Array.from({ length: 25 }, (_, i) =>
        listed({ number: i + 1, isDraft: i === 24 })
      ),
      { COHORT_RESOURCE_LIMIT: '1', MISSED_COHORT: '1' }
    );
    expect(result.status, result.stderr).toBe(0);
    expect(result.pageStarts).toEqual(['0', '20']);
    expect(result.stdout).toContain('would mark #25 ready');
    expect(result.calls.join('\n')).not.toContain('pr list');
  });

  it('caps discovery at 200 PRs while retaining cohort rotation', () => {
    const result = runController(
      Array.from({ length: 205 }, (_, i) => listed({ number: i + 1 })),
      { MISSED_COHORT: '1', RUN_OFFSET: '199' }
    );
    expect(result.status, result.stderr).toBe(0);
    expect(result.pageStarts).toEqual(
      Array.from({ length: 10 }, (_, i) => String(i * 20))
    );
    expect(result.stdout).toContain('would mark #200 ready');
    expect(result.stdout).not.toContain('would mark #201 ready');
  });

  it('does not act on a partial cohort when a later discovery page fails', () => {
    const result = runController(
      Array.from({ length: 25 }, (_, i) => listed({ number: i + 1 })),
      { DRY_RUN: '0', FAIL_COHORT_PAGE: '20' }
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('discovery page unavailable');
    expect(result.calls.some(call => call.startsWith('pr ready'))).toBe(false);
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
    expect(result.calls.length).toBeLessThanOrEqual(5); // pr list + (state, checks) x2
  });
});
