import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { load } from 'js-yaml';
import { describe, expect, it, vi } from 'vitest';

import {
  attachReceiptToReleaseBody,
  buildChangelogWriterProofReceipt,
  CHANGELOG_PR_BODY_MARKER,
  main,
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

describe('publisher writer-proof execution', () => {
  const argv = [
    'node',
    'attach-proof',
    '--pr',
    String(PR_NUMBER),
    '--head',
    HEAD,
  ];
  const pullRequest = (headSha = HEAD, body = PUBLISHER_BODY) => ({
    user: { login: WRITER },
    head: { ref: 'release/daily-changelog-2026-11-01-run-1', sha: headSha },
    body,
  });

  it('attaches a receipt for the live release PR head', () => {
    const github = vi.fn(args =>
      args.includes('PATCH') ? '{}' : JSON.stringify(pullRequest())
    );
    expect(main(argv, { github, repository: 'JovieInc/Jovie' })).toBe(0);
    expect(github).toHaveBeenCalledTimes(2);
    const patch = github.mock.calls[1][0];
    expect(patch.slice(0, 4)).toEqual([
      'api',
      '-X',
      'PATCH',
      `repos/JovieInc/Jovie/pulls/${PR_NUMBER}`,
    ]);
    const body = patch[5].slice('body='.length);
    expect(classifyAutoReadyPromotion(greenSourceInput(body))).toMatchObject({
      eligible: true,
      reason: 'writer-proof-complete',
    });
  });

  it.each(['missing', 'stale', 'stale-with-receipt'])(
    'refuses a %s live head without writing a receipt',
    state => {
      const body =
        state === 'stale-with-receipt'
          ? attachReceiptToReleaseBody({
              body: PUBLISHER_BODY,
              prNumber: PR_NUMBER,
              headSha: HEAD,
              writerLogin: WRITER,
            }).body
          : PUBLISHER_BODY;
      const pr = pullRequest(OTHER_HEAD, body);
      if (state === 'missing') delete pr.head.sha;
      const github = vi.fn(() => JSON.stringify(pr));
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        expect(main(argv, { github, repository: 'JovieInc/Jovie' })).toBe(1);
        expect(github).toHaveBeenCalledTimes(1);
        expect(error).toHaveBeenCalledWith(
          expect.stringContaining('head-mismatch')
        );
      } finally {
        error.mockRestore();
      }
    }
  );

  it('does not rewrite an existing receipt at the live head', () => {
    const { body } = attachReceiptToReleaseBody({
      body: PUBLISHER_BODY,
      prNumber: PR_NUMBER,
      headSha: HEAD,
      writerLogin: WRITER,
    });
    const github = vi.fn(() => JSON.stringify(pullRequest(HEAD, body)));
    expect(main(argv, { github, repository: 'JovieInc/Jovie' })).toBe(0);
    expect(github).toHaveBeenCalledTimes(1);
  });

  it.each([
    { helperExit: 0, originExit: 0 },
    { helperExit: 1, originExit: 0 },
    { helperExit: 0, originExit: 1 },
  ])(
    'the publisher emits origin before proof and propagates $helperExit/$originExit failures',
    ({ helperExit, originExit }) => {
      const workflow = load(
        readFileSync(
          new URL(
            '../../../.github/workflows/production-controller.yml',
            import.meta.url
          ),
          'utf8'
        )
      );
      const publish = workflow.jobs['publish-customer-changelog'].steps.find(
        step => step.run?.includes('gh pr create --draft')
      ).run;
      const start = publish.indexOf('gh pr create --draft');
      const script = publish.slice(start);
      const result = spawnSync(
        'bash',
        [
          '-euc',
          `
      branch=release/daily-changelog-test
      RUNNER_TEMP=/tmp
      gh() {
        if [ "$1 $2" = 'pr create' ]; then echo created-draft >&2;
        elif [ "$1 $2" = 'pr view' ]; then echo ${PR_NUMBER};
        else return 1; fi
      }
      git() { [ "$1 $2" = 'rev-parse HEAD' ] && echo ${HEAD}; }
      python3() { echo emitted-origin >&2; return ${originExit}; }
      node() { echo attached-proof >&2; printf '%s\\n' "$@"; return ${helperExit}; }
      ${script}
    `,
        ],
        { encoding: 'utf8' }
      );
      expect(result.status, result.stderr).toBe(originExit || helperExit);
      expect(result.stderr.trim().split('\n')).toEqual(
        originExit
          ? ['created-draft', 'emitted-origin']
          : ['created-draft', 'emitted-origin', 'attached-proof']
      );
      expect(
        result.stdout.trim() ? result.stdout.trim().split('\n') : []
      ).toEqual(
        originExit
          ? []
          : [
              'scripts/attach-changelog-writer-proof.mjs',
              '--pr',
              String(PR_NUMBER),
              '--head',
              HEAD,
            ]
      );
    }
  );
});
