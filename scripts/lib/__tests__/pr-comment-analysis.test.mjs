import { describe, expect, it } from 'vitest';
import {
  analyzePrCommentData,
  classifyComment,
  isActionableInlineComment,
  isAddressedReply,
  isSummaryNoise,
} from '../pr-comment-analysis.mjs';

const pr = {
  number: 123,
  title: 'feat(testing): add nightly testing agent',
  head: 'codex/nightly-testing-agent',
  author: 'itstimwhite',
  labels: ['testing'],
  url: 'https://github.com/JovieInc/Jovie/pull/123',
};

function inline({
  body,
  author = 'coderabbitai[bot]',
  path = 'apps/web/x.ts',
}) {
  return {
    body,
    html_url: 'https://github.com/JovieInc/Jovie/pull/123#discussion',
    line: 42,
    path,
    position: 5,
    user: { login: author },
  };
}

describe('pr-comment-analysis', () => {
  it('ignores bot summary noise', () => {
    expect(
      isSummaryNoise({
        body: '<!-- This is an auto-generated comment: summarize by coderabbit.ai -->',
      })
    ).toBe(true);
    expect(
      isActionableInlineComment(
        inline({
          body: '<h3>Greptile Summary</h3> This PR changes tests.',
          author: 'greptile-apps[bot]',
        })
      )
    ).toBe(false);
  });

  it('ignores addressed confirmations and resolved replies', () => {
    expect(
      isAddressedReply({
        body: '`@itstimwhite`, confirmed -- this fix closes the gap.',
      })
    ).toBe(true);
    expect(
      isActionableInlineComment(
        inline({
          body: 'Fixed in abc123: the report now includes validation totals.',
          author: 'itstimwhite',
        })
      )
    ).toBe(false);
  });

  it('counts actionable CodeRabbit, Greptile, Sentry, and human findings', () => {
    const data = {
      repo: 'JovieInc/Jovie',
      since: '2026-05-01T00:00:00.000Z',
      pull_count: 1,
      pulls: [
        {
          pr,
          issueComments: [
            {
              body: '## CI Summary\nAll green.',
              user: { login: 'github-actions[bot]' },
            },
          ],
          reviews: [],
          reviewComments: [
            inline({
              body: '_Potential issue_ **Reject candidate commands whose cwd escapes the repository.**',
            }),
            inline({
              body: '<a><img alt="P2"></a> **Risk selection always ignores historical failures**',
              author: 'greptile-apps[bot]',
            }),
            inline({
              body: '**Bug:** The script accesses candidate.expectedSignal.kind without checking if expectedSignal exists.',
              author: 'sentry[bot]',
            }),
            inline({
              body: 'This should fail closed; the current path silently omits validation output.',
              author: 'human-reviewer',
            }),
            inline({
              body: '`@itstimwhite`, confirmed -- thanks for the fix.',
            }),
          ],
        },
      ],
    };

    const analysis = analyzePrCommentData(data);

    expect(analysis.rawCounts.issue).toBe(1);
    expect(analysis.rawCounts.inline).toBe(5);
    expect(analysis.actionableInlineCount).toBe(4);
    expect(analysis.agentOffenderPrs[0].pr.number).toBe(123);
  });

  it('detects recurring hardening categories', () => {
    expect(
      classifyComment({
        path: '.github/workflows/nightly-tests.yml',
        body: 'Both nightly workflows now share the same cron slot.',
      })
    ).toBe('workflow-scheduling');
    expect(
      classifyComment({
        body: 'Reject candidate commands whose cwd escapes the repository.',
      })
    ).toBe('path-scope');
    expect(
      classifyComment({
        body: 'emit-delta silently omits candidate-validation.json from the report.',
      })
    ).toBe('silent-reporting');
    expect(
      classifyComment({
        body: 'expectedSignal is missing and the empty candidates directory throws EISDIR.',
      })
    ).toBe('malformed-state');
  });
});
