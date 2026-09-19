import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  classifyGreenSourceDraft,
  GREEN_SOURCE_HOLD_LABELS,
  GREEN_SOURCE_PROTECTED_PRS,
  greenSourceHoldRegex,
  hasGreenSourceHold,
  isProtectedGreenSourcePr,
  TIM_HOLD_LABELS,
} from '../auto-ready-green-drafts.mjs';

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
    ...overrides,
  };
}

describe('green-source draft classifier', () => {
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

  it('emits a hold regex that matches Tim-hold and machine holds only', () => {
    const re = new RegExp(greenSourceHoldRegex());
    expect(re.test('hold')).toBe(true);
    expect(re.test('tim-hold')).toBe(true);
    expect(re.test('needs-human')).toBe(false);
  });
});

describe('green-source controller contract', () => {
  it('undrafts only and never enrolls or enables auto-merge', () => {
    expect(fleetScript).toContain('gh_retry pr ready "$n" -R "$REPO"');
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
    expect(fleetScript).toContain('gh_retry pr ready "$n" -R "$REPO" --undo');
    expect(fleetScript).toContain('17156');
    expect(fleetScript).not.toContain('17453');
    expect(fleetScript).not.toContain('17929');
    expect(fleetScript).toContain(
      'PROTECTED_PRS="$(node "$CLASSIFY_LIB" protected)"'
    );
    expect(fleetScript.indexOf('before_mutation="$(read_state')).toBeLessThan(
      fleetScript.indexOf('gh_retry pr ready "$n" -R "$REPO" >/dev/null')
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
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('workflow_run:');
    expect(workflow).toContain('check_suite:');
    expect(workflow).toContain(
      "workflows: ['CI', 'Fork PR Gate', 'PR Size Guard']"
    );
    expect(workflow).toContain('scripts/auto-ready-green-drafts.sh');
    expect(workflow).toContain("github.event_name == 'workflow_dispatch'");
    expect(workflow).toContain(
      "github.event.workflow_run.event == 'pull_request'"
    );
    expect(workflow).toContain(
      'github.event.check_suite.head_branch != github.event.repository.default_branch'
    );
    expect(workflow).not.toContain('schedule:');
    expect(workflow).not.toContain('pull_request:');
    expect(workflow).not.toContain('types: [opened, synchronize, reopened]');
    expect(workflow).not.toContain('types: [ready_for_review');
    expect(workflow).not.toContain('ready_for_review/CI cascade');
    expect(workflow).not.toContain('secrets.GITHUB_TOKEN');
  });

  it('mints a short-lived Jovie App token for green-source mutations', () => {
    expect(workflow).toContain(
      'actions/create-github-app-token@bcd2ba49218906704ab6c1aa796996da409d3eb1'
    );
    expect(workflow).toContain(
      'GH_TOKEN: ${{ steps.app-token.outputs.token }}'
    );
    expect(workflow).toContain('id: green-source');
    expect(workflow).toContain('TARGET_PR');
    expect(workflow).toContain('TARGET_HEAD');
  });
});
