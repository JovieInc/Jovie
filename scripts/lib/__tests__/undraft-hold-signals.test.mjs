// JOV-13139 regression coverage: the auto-ready undraft controllers must
// refuse to flip a draft on any deterministic hold signal — a
// `needs-outside-review` / `do-not-ready` label, an unresolved must-fix
// review (`reviewDecision: CHANGES_REQUESTED`), or the structured park body
// marker. Prose in a PR body is deliberately not a signal. Kept in its own
// file so the baselined sibling suites stay inside their size-500 budgets.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  classifyGreenSourceDraft,
  GREEN_SOURCE_HOLD_LABELS,
  greenSourceHoldRegex,
  hasGreenSourceHold,
  selectMissedCohort,
} from '../auto-ready-green-drafts.mjs';
import { UNDRAFT_HOLD_LABELS } from '../auto-ready-provenance.mjs';
import { createGreenSourceController } from './fixtures/green-source-controller.mjs';

const repoRoot = resolve(import.meta.dirname, '../../..');
const head = 'a'.repeat(40);

function writerBody() {
  return 'Ships when green.';
}

function greenChecks() {
  return [
    { name: 'PR Ready', bucket: 'pass', state: 'SUCCESS' },
    { name: 'Migration Guard', bucket: 'pass', state: 'SUCCESS' },
    { name: 'Fork PR Gate', bucket: 'pass', state: 'SUCCESS' },
    { name: 'PR Size Guard', bucket: 'pass', state: 'SUCCESS' },
    { name: 'Company guards', bucket: 'pass', state: 'SUCCESS' },
  ];
}

function draft(overrides = {}) {
  return {
    prNumber: 26042,
    state: 'OPEN',
    draft: true,
    baseRefName: 'main',
    headSha: head,
    mergeable: 'MERGEABLE',
    mergeStateStatus: 'CLEAN',
    labels: [],
    title: 'JOV-13093: dependabot config',
    branch: 'jov-13093-dependabot-config',
    checks: greenChecks(),
    authorLogin: 'itstimwhite',
    body: writerBody(),
    ...overrides,
  };
}

function listed(overrides = {}) {
  return {
    number: 26042,
    isDraft: true,
    baseRefName: 'main',
    headRefName: 'jov-13093-dependabot-config',
    title: 'JOV-13093: dependabot config',
    labels: [],
    reviewDecision: '',
    mergeable: 'MERGEABLE',
    mergeStateStatus: 'CLEAN',
    ...overrides,
  };
}

describe('undraft hold labels (JOV-13139)', () => {
  it.each(['needs-outside-review', 'do-not-ready'])(
    'refuses the flip on the %s label',
    label => {
      expect(UNDRAFT_HOLD_LABELS).toContain(label);
      expect(GREEN_SOURCE_HOLD_LABELS).toContain(label);
      expect(hasGreenSourceHold([label])).toBe(true);
      expect(new RegExp(greenSourceHoldRegex()).test(label)).toBe(true);
      expect(classifyGreenSourceDraft(draft({ labels: [label] }))).toEqual({
        eligible: false,
        reason: 'held',
      });
    }
  );

  it('keeps the undraft-hold labels out of the legacy-inert list', () => {
    for (const label of ['human-review-required', 'needs-human', 'taste']) {
      expect(GREEN_SOURCE_HOLD_LABELS).not.toContain(label);
    }
  });

  it('excludes labeled drafts from the missed-event cohort', () => {
    expect(
      selectMissedCohort(
        [
          listed({ number: 41 }),
          listed({ number: 42, labels: [{ name: 'needs-outside-review' }] }),
          listed({ number: 43, labels: [{ name: 'do-not-ready' }] }),
        ],
        { limit: 10 }
      )
    ).toEqual([41]);
  });
});

describe('unresolved must-fix review hold (JOV-13139)', () => {
  it('refuses the flip while a review requests changes (#26042 class)', () => {
    expect(
      classifyGreenSourceDraft(draft({ reviewDecision: 'CHANGES_REQUESTED' }))
    ).toEqual({ eligible: false, reason: 'review:changes-requested' });
  });

  it.each(['APPROVED', 'REVIEW_REQUIRED', 'PENDING', '', undefined])(
    'treats reviewDecision %p as not a review hold',
    decision => {
      expect(
        classifyGreenSourceDraft(draft({ reviewDecision: decision }))
      ).toMatchObject({ eligible: true });
    }
  );
});

describe('structured body marker vs prose (#26042)', () => {
  // The #26042 incident, verbatim shape: trusted writer, green required
  // checks, CLEAN mergeability, no labels, and a body that only SAYS it
  // stays draft. Prose is not machine-readable state — the classifier
  // cannot honor it without judgment — so such a PR must be pinned with
  // needs-outside-review or the park marker.
  it('prose "stays DRAFT" does not hold; the park marker does', () => {
    const prose = 'Critical config: stays DRAFT until outside review passes.';
    expect(classifyGreenSourceDraft(draft({ body: prose }))).toMatchObject({
      eligible: true,
    });
    expect(
      classifyGreenSourceDraft(
        draft({ body: `${prose}\n<!-- jovie-auto-ready: park -->` })
      )
    ).toEqual({ eligible: false, reason: 'writer-parked' });
  });
});

describe('undraft shell controller hold enforcement', () => {
  const runController = createGreenSourceController({
    repoRoot,
    head,
    writerBody,
    checks: greenChecks(),
  });
  const ready = {
    TARGET_PR: '26042',
    TARGET_HEAD: head,
    MISSED_COHORT: '0',
    DRY_RUN: '0',
  };
  const flipCalls = result =>
    result.calls.filter(
      call => call.startsWith('pr ready') && !call.includes('--undo')
    ).length;

  it('a green trusted-writer draft still flips (control)', () => {
    const result = runController([listed()], ready);
    expect(result.status).toBe(0);
    expect(flipCalls(result)).toBe(1);
  });

  it('a needs-outside-review label keeps the draft', () => {
    const result = runController(
      [listed({ labels: [{ name: 'needs-outside-review' }] })],
      ready
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('held');
    expect(flipCalls(result)).toBe(0);
  });

  it('a do-not-ready label keeps the draft', () => {
    const result = runController(
      [listed({ labels: [{ name: 'do-not-ready' }] })],
      ready
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('held');
    expect(flipCalls(result)).toBe(0);
  });

  it('a CHANGES_REQUESTED review keeps the draft', () => {
    const result = runController(
      [listed({ reviewDecision: 'CHANGES_REQUESTED' })],
      ready
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('review:changes-requested');
    expect(flipCalls(result)).toBe(0);
  });

  it('a review turning must-fix between screen and mutation aborts the flip', () => {
    const result = runController([listed()], {
      ...ready,
      STATE_AFTER_FIRST_READ: JSON.stringify({
        reviewDecision: 'CHANGES_REQUESTED',
      }),
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('review:changes-requested');
    expect(flipCalls(result)).toBe(0);
  });

  it('a park marker keeps the draft despite successful checks', () => {
    const result = runController(
      [listed({ body: 'Still working.\n<!-- jovie-auto-ready: park -->' })],
      ready
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('writer-parked');
    expect(flipCalls(result)).toBe(0);
  });
});

describe('both undraft controllers read the hold state (JOV-13139)', () => {
  const fleetScript = readFileSync(
    resolve(repoRoot, 'scripts/auto-ready-green-drafts.sh'),
    'utf8'
  );
  const writerScript = readFileSync(
    resolve(repoRoot, 'scripts/auto-ready-agent-drafts.sh'),
    'utf8'
  );

  it('fetches reviewDecision in both GraphQL reads and guards both flips', () => {
    for (const script of [fleetScript, writerScript]) {
      expect(script).toContain('reviewDecision');
      expect(script).toContain('!= "CHANGES_REQUESTED"');
      expect(script).toContain('review_after=');
    }
  });

  it('does not need a workflow change: both scripts read state at runtime', () => {
    expect(fleetScript).toContain('auto-ready-green-drafts.mjs');
    expect(writerScript).toContain('auto-ready-provenance.mjs');
  });
});
