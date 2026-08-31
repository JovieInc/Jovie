import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildPromotionBlocker,
  buildWriterProofReceipt,
  evaluateWriterPromotion,
  renderPromotionBlockerComment,
  validateWriterProofReceipt,
} from '../writer-owned-pr-promotion.mjs';

const repoRoot = resolve(import.meta.dirname, '../../..');
const script = readFileSync(
  resolve(repoRoot, 'scripts/writer-owned-pr-promote.sh'),
  'utf8'
);
const head = 'a'.repeat(40);
const context = {
  expectedHeadSha: head,
  writerLogin: 'itstimwhite',
  prNumber: 16859,
};
const completeEvidence = {
  issueId: 'GH-16859',
  prNumber: 16859,
  headSha: head,
  writerLogin: 'itstimwhite',
  requiredTests: 'passed: focused validation and hosted exact-head CI passed',
  reviewSweep: 'complete: top-level, inline, and review summaries checked',
  ticketEvidence: 'attached: Linear workpad has acceptance proof',
  prEvidence: 'attached: PR body has validation proof',
  issuedAt: '2026-08-31T00:00:00.000Z',
};

const receipt = (overrides = {}) =>
  buildWriterProofReceipt({ ...completeEvidence, ...overrides });
const state = (overrides = {}) => ({
  state: 'OPEN',
  draft: true,
  head,
  labels: [],
  autoMerge: false,
  queued: false,
  ...overrides,
});
const decision = (proof = receipt(), prState = state()) =>
  evaluateWriterPromotion({ receipt: proof, state: prState, ...context });

describe('writer-owned PR proof receipt', () => {
  it.each([
    ['reviewSweep', 'pending', 'review-sweep'],
    ['requiredTests', 'failed: 12 tests failed', 'required-tests'],
    ['ticketEvidence', 'missing: Linear workpad absent', 'ticket-evidence'],
    ['prEvidence', 'skipped: PR body not updated', 'pr-evidence'],
  ])('blocks incomplete or negative %s proof', (field, value, gateId) => {
    const proof = receipt({ [field]: value });

    expect(proof).toMatchObject({
      proofComplete: false,
      blockedBy: expect.arrayContaining([gateId]),
    });
    expect(validateWriterProofReceipt(proof, context)).toEqual({
      ok: false,
      reason: `gate-${gateId}`,
    });
    expect(decision(proof)).toMatchObject({ ok: false, action: 'block' });
  });

  it('accepts only exact-head draft proof on the writer path', () => {
    expect(validateWriterProofReceipt(receipt(), context)).toMatchObject({
      ok: true,
      reason: 'proof-complete',
    });
    expect(decision()).toEqual({
      ok: true,
      action: 'promote',
      reason: 'proof-complete',
    });
    expect(
      validateWriterProofReceipt(receipt(), {
        ...context,
        expectedHeadSha: 'b'.repeat(40),
      })
    ).toEqual({ ok: false, reason: 'head-mismatch' });

    const tampered = receipt();
    tampered.evidence.reviewSweep = 'pending';
    expect(validateWriterProofReceipt(tampered, context)).toEqual({
      ok: false,
      reason: 'evidence-review-sweep',
    });
  });

  it('rejects reconciliation dependency, hard holds, and ready-unenrolled state', () => {
    expect(
      validateWriterProofReceipt(
        receipt({ reconciliationRequired: true }),
        context
      )
    ).toEqual({
      ok: false,
      reason: 'gate-writer-promotion-path',
    });
    expect(decision(receipt(), state({ draft: false }))).toEqual({
      ok: false,
      action: 'compensate',
      reason: 'ready-unenrolled',
    });
    for (const label of [
      'human-review-required',
      'security',
      'needs:security',
      'controlled-proof',
    ]) {
      expect(decision(receipt(), state({ labels: [{ name: label }] }))).toEqual(
        {
          ok: false,
          action: 'block',
          reason: `held-by-${label}`,
        }
      );
    }
  });

  it.each([
    { autoMerge: true },
    { queued: true },
  ])('accepts exact-head native intent %j', nativeIntent => {
    expect(
      decision(receipt(), state({ draft: false, ...nativeIntent }))
    ).toEqual({
      ok: true,
      action: 'already-complete',
      reason: 'native-intent-established',
    });
  });

  it('emits a typed terminal blocker attributed to writer and head', () => {
    const blocker = buildPromotionBlocker({
      issueId: 'JOV-5751',
      prNumber: 16859,
      headSha: head,
      writerLogin: 'itstimwhite',
      phase: 'native-intent',
      reason: 'auto-merge-request-failed',
      compensation: { attempted: true, verified: true, state: state() },
      emittedAt: '2026-08-31T00:00:00.000Z',
    });

    expect(blocker).toMatchObject({
      schema: 'jovie-writer-pr-promotion-blocker/v1',
      status: 'terminal-blocker',
      headSha: head,
      writerLogin: 'itstimwhite',
    });
    expect(renderPromotionBlockerComment(blocker)).toContain(
      'auto-merge-request-failed'
    );
  });

  it('entrypoints bind promotion to writer proof and native intent', () => {
    for (const token of [
      'JOV-INV-022',
      'node "$PROMOTION_LIB" receipt',
      'writer-token-mismatch',
      'gh_retry pr ready "$PR_NUMBER"',
      'gh_retry pr merge "$PR_NUMBER"',
      '--match-head-commit "$EXPECTED_HEAD"',
      'compensate_to_draft',
      'writer-owned-pr-promotion',
    ]) {
      expect(script).toContain(token);
    }
  });
});
