import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AUTO_READY_HOLD_LABELS,
  classifyAutoReadyPromotion,
  classifyFxChildCommit,
  FX_WRITER_EMAIL,
  FX_WRITER_NAME,
  parseFxSourceHeadTrailer,
  TRUSTED_FX_WORKFLOW_NAME,
  TRUSTED_FX_WORKFLOW_PATH,
} from '../auto-ready-provenance.mjs';
import {
  buildWriterProofReceipt,
  evaluateWriterPromotion,
  renderWriterProofReceipt,
  WRITER_PROMOTION_BLOCKER_SCHEMA,
} from '../writer-owned-pr-promotion.mjs';

const repoRoot = resolve(import.meta.dirname, '../../..');
const fleetScript = readFileSync(
  resolve(repoRoot, 'scripts/auto-ready-agent-drafts.sh'),
  'utf8'
);
const workflow = readFileSync(
  resolve(repoRoot, '.github/workflows/auto-ready-agent-drafts.yml'),
  'utf8'
);
const promotionScript = readFileSync(
  resolve(repoRoot, 'scripts/writer-owned-pr-promote.sh'),
  'utf8'
);
const fxWorkflow = readFileSync(
  resolve(repoRoot, '.github/workflows/rolling-ci-dispatch.yml'),
  'utf8'
);
const parent = 'a'.repeat(40);
const child = 'b'.repeat(40);
const other = 'c'.repeat(40);
const prNumber = 14359;
const writerLogin = 'itstimwhite';
const proofBase = {
  issueId: 'JOV-5751',
  prNumber,
  headSha: child,
  writerLogin,
  requiredTests: 'passed: focused tests and hosted CI',
  reviewSweep: 'complete: top-level, inline, and review summaries checked',
  ticketEvidence: 'attached: Linear workpad is current',
  prEvidence: 'attached: PR body has validation evidence',
  issuedAt: '2026-08-31T00:00:00.000Z',
};

function trustedFxRun(overrides = {}) {
  return {
    workflowPath: TRUSTED_FX_WORKFLOW_PATH,
    workflowName: TRUSTED_FX_WORKFLOW_NAME,
    conclusion: 'success',
    event: 'workflow_run',
    headSha: parent,
    ...overrides,
  };
}

function fxCommit(overrides = {}) {
  return {
    sha: child,
    message: `fix(ci): remediate exact-head failure\n\nFX-Source-Head: ${parent}\n`,
    parentShas: [parent],
    authorName: FX_WRITER_NAME,
    authorEmail: FX_WRITER_EMAIL,
    authorLogin: '',
    committerName: FX_WRITER_NAME,
    committerEmail: FX_WRITER_EMAIL,
    committerLogin: 'jovie-bot[bot]',
    verified: true,
    ...overrides,
  };
}

function proofReceipt(overrides = {}) {
  return buildWriterProofReceipt({ ...proofBase, ...overrides });
}

function proofBody(overrides = {}) {
  return renderWriterProofReceipt(proofReceipt(overrides));
}

function promotion(overrides = {}) {
  return classifyAutoReadyPromotion({
    prNumber,
    authorLogin: writerLogin,
    title: 'fix(ci): remediate exact-head failure',
    branch: 'tim/jov-5477-human-draft',
    labels: [],
    headSha: child,
    body: proofBody(),
    commit: fxCommit(),
    fxRun: trustedFxRun(),
    ...overrides,
  });
}

function prState(overrides = {}) {
  return {
    state: 'OPEN',
    draft: true,
    head: child,
    labels: [],
    autoMerge: false,
    queued: false,
    ...overrides,
  };
}

function writerPromotion(receipt = proofReceipt(), state = prState()) {
  return evaluateWriterPromotion({
    receipt,
    state,
    expectedHeadSha: child,
    writerLogin,
    prNumber,
  });
}

describe('Retired fleet draft promotion', () => {
  it('cannot replay withdrawn author readiness, even with historical proof and recovery flags', () => {
    const dir = mkdtempSync(resolve(tmpdir(), 'retired-auto-ready-'));
    try {
      const marker = resolve(dir, 'effects');
      for (const tool of ['gh', 'node', 'jq', 'curl']) {
        writeFileSync(
          resolve(dir, tool),
          '#!/bin/sh\necho effect >> "$EFFECTS"\nexit 99\n',
          { mode: 0o700 }
        );
      }
      for (const dryRun of ['0', '1']) {
        const result = spawnSync(
          '/bin/bash',
          [
            resolve(repoRoot, 'scripts/auto-ready-agent-drafts.sh'),
            '--pr',
            String(prNumber),
            '--head',
            child,
          ],
          {
            encoding: 'utf8',
            env: {
              ...process.env,
              PATH: dir,
              EFFECTS: marker,
              DRY_RUN: dryRun,
              REPO: 'JovieInc/Jovie',
              WRITER_PROOF: proofBody(),
              ALLOW_LEGACY_ADMISSION: '1',
            },
          }
        );
        expect(result.status).toBe(2);
        expect(result.stderr).toContain('owner completion required');
        expect(existsSync(marker)).toBe(false);
      }
      expect(fleetScript).not.toContain('source ');
      expect(fleetScript).not.toContain('gh_retry');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('Auto-Ready provenance selector (diagnostic only)', () => {
  it('rejects an allowlisted bot author without an author-owned proof receipt', () => {
    expect(
      classifyAutoReadyPromotion({
        prNumber,
        authorLogin: 'jovie-bot[bot]',
        title: 'fix(ci): repair draft',
        branch: 'tim/jov-5477-bot-repair',
        labels: [],
        headSha: child,
      })
    ).toEqual({ eligible: false, reason: 'writer-proof-proof-missing' });
  });

  it('allows an exact author-owned proof receipt on any branch', () => {
    expect(promotion()).toEqual({
      eligible: true,
      reason: 'writer-proof-complete',
    });
  });

  it('keeps FX child provenance as diagnostic context, not promotion authority', () => {
    expect(
      classifyFxChildCommit({
        headSha: child,
        commit: fxCommit(),
        fxRun: trustedFxRun(),
      })
    ).toEqual({
      eligible: true,
      reason: 'trusted-fx-child',
    });
    expect(parseFxSourceHeadTrailer(fxCommit().message)).toBe(parent);
    // Hosted writer moved to GraphQL createCommitOnBranch via rolling-ci-fx.
    expect(fxWorkflow).toContain(TRUSTED_FX_WORKFLOW_NAME);
    expect(fxWorkflow).toContain(
      'node scripts/lib/rolling-ci-fx.mjs hosted-commit'
    );
  });

  it('rejects a stale proof even on an agent prefix', () => {
    expect(
      promotion({
        body: proofBody({ headSha: other }),
      })
    ).toEqual({ eligible: false, reason: 'writer-proof-head-mismatch' });
  });

  it.each([
    ['canary', { labels: ['canary'] }],
    ['controlled-proof', { labels: ['controlled-proof'] }],
    ['deliberate-red', { title: 'fix(ci): [deliberate-red] fixture' }],
    ['canary branch', { branch: 'canary/jov-5477-proof' }],
  ])('fails closed on controlled-proof marker %s', (_name, overrides) => {
    expect(promotion({ authorLogin: 'jovie-bot[bot]', ...overrides })).toEqual({
      eligible: false,
      reason: 'controlled-proof',
    });
  });

  it.each([
    'security',
    'hold',
    'gated',
    'queue-deferred',
  ])('never mutates a hard-held PR labeled %s', label => {
    expect(
      promotion({ authorLogin: 'jovie-bot[bot]', labels: [label] })
    ).toEqual({ eligible: false, reason: 'held' });
    expect(AUTO_READY_HOLD_LABELS).toEqual(expect.arrayContaining([label]));
  });

  it.each([
    'human-review-required',
    'needs-human',
    'needs-human-review',
    'needs-human-taste',
    'needs:taste',
    'no-auto',
    'no-auto-merge',
    'no-automerge',
    'taste',
  ])('ignores the legacy %s label during writer promotion', label => {
    expect(promotion({ labels: [label] })).toMatchObject({ eligible: true });
    expect(AUTO_READY_HOLD_LABELS).not.toContain(label);
  });

  it('fails closed when the live head moved away from the classified commit', () => {
    expect(
      promotion({
        headSha: other,
        body: proofBody({ headSha: child }),
      })
    ).toEqual({
      eligible: false,
      reason: 'writer-proof-head-mismatch',
    });
  });

  it('fails closed on ambiguous or unsigned FX provenance', () => {
    expect(
      classifyFxChildCommit({
        headSha: child,
        commit: fxCommit({ parentShas: [parent, other] }),
      })
    ).toEqual({ eligible: false, reason: 'ambiguous-provenance' });
    expect(
      classifyFxChildCommit({
        headSha: child,
        commit: fxCommit({
          committerLogin: '',
          authorLogin: '',
          verified: false,
        }),
        fxRun: trustedFxRun(),
      })
    ).toEqual({ eligible: false, reason: 'fx-app-provenance-missing' });
    expect(
      classifyFxChildCommit({
        headSha: child,
        commit: fxCommit(),
        fxRun: null,
      })
    ).toEqual({
      eligible: false,
      reason: 'fx-run-missing',
    });
  });
});

describe('Writer-owned PR promotion proof', () => {
  it.each([
    ['reviewSweep', 'pending', 'review-sweep'],
    ['requiredTests', 'failed: 12 tests failed', 'required-tests'],
    ['ticketEvidence', 'missing: Linear workpad absent', 'ticket-evidence'],
    ['prEvidence', 'skipped: PR body not updated', 'pr-evidence'],
  ])('blocks incomplete or negative %s proof', (field, value, gateId) => {
    expect(writerPromotion(proofReceipt({ [field]: value }))).toMatchObject({
      action: 'block',
      reason: `gate-${gateId}`,
    });
  });

  it('accepts only exact-head draft proof on the writer path', () => {
    expect(writerPromotion()).toMatchObject({
      action: 'promote',
      reason: 'proof-complete',
    });
    expect(writerPromotion(proofReceipt({ headSha: other }))).toMatchObject({
      action: 'block',
      reason: 'head-mismatch',
    });
  });

  it('rejects reconciliation dependency, hard holds, and ready-unenrolled state', () => {
    expect(
      writerPromotion(proofReceipt({ reconciliationRequired: true }))
    ).toMatchObject({
      action: 'block',
      reason: 'gate-writer-promotion-path',
    });
    expect(
      writerPromotion(proofReceipt(), prState({ draft: false }))
    ).toMatchObject({
      action: 'compensate',
      reason: 'ready-unenrolled',
    });
    expect(
      writerPromotion(proofReceipt(), prState({ labels: ['controlled-proof'] }))
    ).toMatchObject({
      action: 'block',
      reason: 'held-by-controlled-proof',
    });
  });

  it('accepts terminal exact-head promotion state', () => {
    expect(
      writerPromotion(
        proofReceipt(),
        prState({ state: 'MERGED', draft: false })
      ).reason
    ).toBe('merged-at-exact-head');
  });

  it('emits typed blockers and keeps the shell entrypoint atomic', () => {
    expect(WRITER_PROMOTION_BLOCKER_SCHEMA).toBe(
      'jovie-writer-pr-promotion-blocker/v1'
    );
    [
      'native-merge-intent.mjs" --repo "$REPO" --pr "$PR_NUMBER" --head "$EXPECTED_HEAD"',
      'dequeuePullRequest',
      'compensate_to_draft',
      'render-blocker',
    ].forEach(token => expect(promotionScript).toContain(token));
  });
});

describe('Retired Auto-Ready workflow compatibility', () => {
  it('has no token or invocation that can revive fleet readiness recovery', () => {
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('owner-completion-required');
    expect(workflow).not.toContain('create-github-app-token');
    expect(workflow).not.toContain('GH_TOKEN');
    expect(workflow).not.toContain('run: bash');
    expect(workflow).not.toContain('pull-requests: write');
    const tick = readFileSync(
      resolve(repoRoot, '.github/workflows/agent-tick.yml'),
      'utf8'
    );
    expect(tick).toContain('owner-completion-required');
    expect(tick).not.toContain('run: bash scripts/auto-ready-agent-drafts.sh');
  });
});
