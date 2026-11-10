import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { load } from 'js-yaml';
import { describe, expect, it, vi } from 'vitest';

import {
  attachReceiptToReleaseBody,
  buildChangelogWriterProofReceipt,
  CHANGELOG_PR_BODY_MARKER,
  gh,
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
    expect(
      releasePrEligibleForWriterProof({ ...base, actualHeadSha: OTHER_HEAD })
    ).toMatchObject({ eligible: false, reason: 'head-mismatch' });
    expect(
      releasePrEligibleForWriterProof({ ...base, actualHeadSha: HEAD })
    ).toMatchObject({ eligible: true, reason: 'release-pr-shape' });
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
    expect(github).toHaveBeenCalledTimes(3);
    const patch = github.mock.calls[2][0];
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

  it('preserves concurrent body metadata by rebuilding after a fresh read', () => {
    const updated = `${PUBLISHER_BODY}\n<!-- another-receipt/v1 -->`;
    let reads = 0;
    const github = vi.fn(args =>
      args.includes('PATCH')
        ? '{}'
        : JSON.stringify(
            pullRequest(HEAD, ++reads === 1 ? PUBLISHER_BODY : updated)
          )
    );
    expect(main(argv, { github })).toBe(0);
    expect(github).toHaveBeenCalledTimes(5);
    expect(github.mock.calls[4][0][5]).toContain('<!-- another-receipt/v1 -->');
  });

  it('refuses a head change observed immediately before writing', () => {
    let reads = 0;
    const github = vi.fn(() =>
      JSON.stringify(pullRequest(++reads === 1 ? HEAD : OTHER_HEAD))
    );
    expect(main(argv, { github })).toBe(1);
    expect(github).toHaveBeenCalledTimes(2);
  });

  it('reads back an uncertain successful PATCH before retrying and avoids a duplicate write', () => {
    let body = PUBLISHER_BODY;
    const github = vi.fn(args => {
      if (!args.includes('PATCH'))
        return JSON.stringify(pullRequest(HEAD, body));
      body = args[5].slice('body='.length);
      throw Object.assign(new Error('connection reset'), { retryable: true });
    });
    expect(main(argv, { github })).toBe(0);
    expect(github).toHaveBeenCalledTimes(4);
    expect(
      github.mock.calls.filter(([args]) => args.includes('PATCH'))
    ).toHaveLength(1);
  });

  it('retries a transient PATCH when readback confirms the receipt is still absent', () => {
    let writes = 0;
    const github = vi.fn(args => {
      if (!args.includes('PATCH')) return JSON.stringify(pullRequest());
      if (++writes === 1)
        throw Object.assign(new Error('HTTP 502'), { retryable: true });
      return '{}';
    });
    expect(main(argv, { github })).toBe(0);
    expect(
      github.mock.calls.map(([args]) =>
        args.includes('PATCH') ? 'PATCH' : 'GET'
      )
    ).toEqual(['GET', 'GET', 'PATCH', 'GET', 'GET', 'PATCH']);
  });

  it('bounds transient PATCH recovery to three writes with fresh reads before each', () => {
    const github = vi.fn(args => {
      if (!args.includes('PATCH')) return JSON.stringify(pullRequest());
      throw Object.assign(new Error('HTTP 503'), { retryable: true });
    });
    expect(() => main(argv, { github })).toThrow('HTTP 503');
    expect(
      github.mock.calls.map(([args]) =>
        args.includes('PATCH') ? 'PATCH' : 'GET'
      )
    ).toEqual([
      'GET',
      'GET',
      'PATCH',
      'GET',
      'GET',
      'PATCH',
      'GET',
      'GET',
      'PATCH',
    ]);
  });

  it('does not add retries to shared-client GET failures or permanent PATCH failures', () => {
    for (const failRead of [true, false]) {
      const github = vi.fn(args => {
        if (failRead || args.includes('PATCH'))
          throw new Error('quota or authorization refused');
        return JSON.stringify(pullRequest());
      });
      expect(() => main(argv, { github })).toThrow(
        'quota or authorization refused'
      );
      expect(github).toHaveBeenCalledTimes(failRead ? 1 : 3);
    }
  });

  it('does not retry an ineligible publisher PR', () => {
    const github = vi.fn(() =>
      JSON.stringify({ ...pullRequest(), user: { login: 'itstimwhite' } })
    );
    expect(main(argv, { github })).toBe(1);
    expect(github).toHaveBeenCalledTimes(1);
  });

  it.each([
    {
      method: 'PATCH',
      status: 1,
      stderr: 'HTTP 502 Bad Gateway',
      retryable: true,
    },
    { method: 'PATCH', status: 1, stderr: 'connection reset', retryable: true },
    {
      method: 'GET',
      status: 1,
      stderr: 'HTTP 502 Bad Gateway',
      retryable: false,
    },
    {
      method: 'PATCH',
      status: 1,
      stderr: 'HTTP 429 rate limit',
      retryable: false,
    },
    {
      method: 'PATCH',
      status: 1,
      stderr: 'HTTP 403 forbidden',
      retryable: false,
    },
    { method: 'PATCH', status: 75, stderr: 'quota deferred', retryable: false },
  ])(
    'classifies $method/$stderr without bypassing the budgeted client',
    ({ method, status, stderr, retryable }) => {
      const args =
        method === 'PATCH'
          ? ['api', '-X', 'PATCH', 'repos/JovieInc/Jovie/pulls/4164']
          : ['api', 'repos/JovieInc/Jovie/pulls/4164'];
      const run = vi.fn(() => ({ status, stderr, stdout: '' }));
      let failure;
      try {
        gh(args, run);
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeInstanceOf(Error);
      expect(Boolean(failure.retryable)).toBe(retryable);
      expect(run).toHaveBeenCalledTimes(1);
      expect(run.mock.calls[0].slice(0, 2)).toEqual([
        process.execPath,
        [
          'packages/api-client/cli.ts',
          'gh',
          '--priority',
          'default',
          '--',
          ...args,
        ],
      ]);
    }
  );

  it.each([
    { helperExit: 0, originExit: 0 },
    { helperExit: 1, originExit: 0 },
    { helperExit: 0, originExit: 1 },
  ])(
    'the publisher emits origin before proof and propagates $helperExit/$originExit failures',
    ({ helperExit, originExit }) => {
      const workflow =
        /** @type {{jobs: Record<string, {steps: Array<{run?: string}>}>}} */ (
          load(
            readFileSync(
              new URL(
                '../../../.github/workflows/production-controller.yml',
                import.meta.url
              ),
              'utf8'
            )
          )
        );
      const publish = workflow.jobs['publish-customer-changelog'].steps.find(
        step => step.run?.includes('gh pr create --draft')
      ).run;
      const start = publish.indexOf('gh pr create --draft');
      const script = publish.slice(start);
      const fixtureHome = mkdtempSync(
        join(tmpdir(), 'changelog-shell-startup-')
      );
      writeFileSync(
        join(fixtureHome, '.bashrc'),
        "printf '%s\\n' fixture-startup-noise >&2\n"
      );
      let result;
      try {
        result = spawnSync(
          'bash',
          [
            '--noprofile',
            '--norc',
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
      node() {
        if [ "$1" = packages/api-client/cli.ts ]; then echo ${PR_NUMBER};
        else echo attached-proof >&2; printf '%s\\n' "$@"; return ${helperExit}; fi
      }
      ${script}
    `,
          ],
          {
            encoding: 'utf8',
            env: {
              ...process.env,
              HOME: fixtureHome,
              SHLVL: '0',
              SSH_CLIENT: 'fixture',
              BASH_ENV: undefined,
              ENV: undefined,
            },
          }
        );
      } finally {
        rmSync(fixtureHome, { recursive: true, force: true });
      }
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
