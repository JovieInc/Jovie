import { describe, expect, it } from 'vitest';

import {
  attachReceiptToReleaseBody,
  buildChangelogWriterProofReceipt,
  CHANGELOG_PR_BODY_MARKER,
  RELEASE_PR_WRITER_EVIDENCE,
  releasePrEligibleForWriterProof,
} from '../../attach-changelog-writer-proof.mjs';
import { classifyAutoReadyPromotion } from '../../lib/auto-ready-provenance.mjs';
import {
  extractLatestWriterProofReceipt,
  validateWriterProofReceipt,
} from '../../lib/writer-owned-pr-promotion.mjs';

const HEAD = 'a'.repeat(40);
const OTHER_HEAD = 'b'.repeat(40);
const PR_NUMBER = 4164;
const WRITER = 'jovie-bot[bot]';

/** The exact PR body the publish-customer-changelog step writes today. */
const PUBLISHER_BODY = [
  '## Customer updates',
  'Publish at most three grouped customer outcomes from exact Production Verified, deployment ancestry and public customer-path readback. Approved source copy and runtime hashes are bound in the hidden daily receipt. No PR titles become release notes.',
  '',
  'CHANGELOG.md only; no executable behavior changed. The existing source CI, native merge queue and Production Controller remain authoritative. Subscriptions and email delivery are unchanged.',
  '',
  `<!-- ${CHANGELOG_PR_BODY_MARKER} {"releaseWorthy":false} -->`,
  '',
].join('\n');

const greenSourceInput = (body, head = HEAD) => ({
  body,
  headSha: head,
  authorLogin: WRITER,
  prNumber: PR_NUMBER,
  labels: [],
  branch: `release/daily-changelog-2026-11-01-run-1`,
  title: 'docs(changelog): customer updates 2026-11-01',
});

describe('changelog release PR writer proof (JOV-10216)', () => {
  it('builds a complete writer-proof receipt for the publisher', () => {
    const receipt = buildChangelogWriterProofReceipt({
      prNumber: PR_NUMBER,
      headSha: HEAD,
      writerLogin: WRITER,
    });
    expect(receipt.proofComplete).toBe(true);
    expect(receipt.blockedBy).toEqual([]);
    expect(receipt.ownership).toBe('author-owned');
    expect(
      validateWriterProofReceipt(receipt, {
        expectedHeadSha: HEAD,
        writerLogin: WRITER,
        prNumber: PR_NUMBER,
      })
    ).toMatchObject({ ok: true, reason: 'proof-complete' });
  });

  it('does not let the receipt validate at a different head or author', () => {
    const receipt = buildChangelogWriterProofReceipt({
      prNumber: PR_NUMBER,
      headSha: HEAD,
      writerLogin: WRITER,
    });
    expect(
      validateWriterProofReceipt(receipt, {
        expectedHeadSha: OTHER_HEAD,
        writerLogin: WRITER,
        prNumber: PR_NUMBER,
      }).ok
    ).toBe(false);
    expect(
      validateWriterProofReceipt(receipt, {
        expectedHeadSha: HEAD,
        writerLogin: 'jovie-ci-lane[bot]',
        prNumber: PR_NUMBER,
      }).ok
    ).toBe(false);
  });

  it('documents the deadlock: the publisher body without a receipt is writer-proof-missing', () => {
    const decision = classifyAutoReadyPromotion(
      greenSourceInput(PUBLISHER_BODY)
    );
    expect(decision).toMatchObject({
      eligible: false,
      reason: 'writer-proof-proof-missing',
    });
  });

  it('the attached receipt satisfies Auto-Ready green-source classification', () => {
    const { body, receipt } = attachReceiptToReleaseBody({
      body: PUBLISHER_BODY,
      prNumber: PR_NUMBER,
      headSha: HEAD,
      writerLogin: WRITER,
    });
    expect(extractLatestWriterProofReceipt(body)).toEqual(receipt);
    // The customer-changelog marker must survive the attach.
    expect(body).toContain(CHANGELOG_PR_BODY_MARKER);
    expect(classifyAutoReadyPromotion(greenSourceInput(body))).toMatchObject({
      eligible: true,
      reason: 'writer-proof-complete',
    });
  });

  it('attaching is idempotent and re-binds a stale receipt to the new head', () => {
    const first = attachReceiptToReleaseBody({
      body: PUBLISHER_BODY,
      prNumber: PR_NUMBER,
      headSha: HEAD,
      writerLogin: WRITER,
    });
    const again = attachReceiptToReleaseBody({
      body: first.body,
      prNumber: PR_NUMBER,
      headSha: HEAD,
      writerLogin: WRITER,
    });
    // issuedAt churns by design; what must hold is that the re-attached
    // receipt still validates at the same head and the marker survives.
    expect(
      validateWriterProofReceipt(extractLatestWriterProofReceipt(again.body), {
        expectedHeadSha: HEAD,
        writerLogin: WRITER,
        prNumber: PR_NUMBER,
      })
    ).toMatchObject({ ok: true });
    expect(again.body).toContain(CHANGELOG_PR_BODY_MARKER);

    const rebound = attachReceiptToReleaseBody({
      body: first.body,
      prNumber: PR_NUMBER,
      headSha: OTHER_HEAD,
      writerLogin: WRITER,
    });
    expect(
      validateWriterProofReceipt(
        extractLatestWriterProofReceipt(rebound.body),
        {
          expectedHeadSha: OTHER_HEAD,
          writerLogin: WRITER,
          prNumber: PR_NUMBER,
        }
      )
    ).toMatchObject({ ok: true });
    expect(
      classifyAutoReadyPromotion(greenSourceInput(rebound.body, OTHER_HEAD))
    ).toMatchObject({ eligible: true, reason: 'writer-proof-complete' });
  });

  it('every evidence field is complete and none reads as pending', () => {
    for (const value of Object.values(RELEASE_PR_WRITER_EVIDENCE)) {
      expect(value).toMatch(/^(passed|attached|complete): /);
    }
  });

  it('only the publisher release-PR shape may receive the receipt', () => {
    const base = {
      prNumber: PR_NUMBER,
      headSha: HEAD,
      authorLogin: WRITER,
      body: PUBLISHER_BODY,
      branch: 'release/daily-changelog-2026-11-01-run-1',
    };
    expect(releasePrEligibleForWriterProof(base)).toMatchObject({
      eligible: true,
      reason: 'release-pr-shape',
    });
    expect(
      releasePrEligibleForWriterProof({ ...base, branch: 'feat/changelog' })
    ).toMatchObject({ eligible: false, reason: 'not-release-branch' });
    expect(
      releasePrEligibleForWriterProof({ ...base, authorLogin: 'itstimwhite' })
    ).toMatchObject({ eligible: false, reason: 'author-untrusted' });
    expect(
      releasePrEligibleForWriterProof({ ...base, body: 'no marker' })
    ).toMatchObject({ eligible: false, reason: 'missing-body-marker' });
    expect(
      releasePrEligibleForWriterProof({ ...base, headSha: 'short' })
    ).toMatchObject({ eligible: false, reason: 'head-unavailable' });
    expect(
      releasePrEligibleForWriterProof({ ...base, prNumber: 0 })
    ).toMatchObject({ eligible: false, reason: 'pr-unavailable' });
  });
});
