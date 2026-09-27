import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { QuestionMapEntry } from '@/lib/answer-content/question-map';
import { isLaunchEnabled } from '@/lib/content-primitive/contract';
import {
  ideaIssueBody,
  MAX_IDEAS_PER_DAY,
  selectAnswerIdeas,
} from '@/lib/content-primitive/ideas';
import {
  AUTO_PUBLISH_STREAK,
  certificationStreak,
  decideLaunch,
  type LaunchLedger,
  recordCertification,
} from '@/lib/content-primitive/publish-gate';
import {
  certifyAnswerScript,
  scriptReceipts,
} from '@/lib/content-primitive/script-certification';
import { coveredQuestionIds, PATHS } from '@/scripts/answer-content/pipeline';

function entry(
  id: string,
  score: 0 | 1 | 2 | 3,
  overrides: Partial<QuestionMapEntry> = {}
): QuestionMapEntry {
  return {
    id,
    question: `Question ${id}?`,
    variants: [],
    topic: 'smart links',
    platforms: ['google_paa'],
    sources: [],
    observations: 1,
    engagementProxy: 100,
    intent: 'how_to',
    answerGap: { gap: 'forum_only', topAnswer: null },
    jovieRelevance: { score, productPaths: ['/smart-links'] },
    priority: 5,
    ...overrides,
  };
}

const PARAGRAPH =
  'A smart link is one URL for a release that sends each fan to the song in the music app they already use, so one post works for every listener you have.';

function script({
  frontmatter = {},
  body,
}: {
  frontmatter?: Record<string, string>;
  body?: string;
} = {}): string {
  const fields = {
    title: 'What is a smart link for music, and when do you need one?',
    description:
      'A smart link opens your release in each fan’s own music app with one URL. What it does and when it helps.',
    date: '2026-09-27',
    category: 'Release Strategy',
    contentType: 'answer-article',
    question: 'What is a smart link used for?',
    ...frontmatter,
  };
  const filler = Array.from({ length: 16 }, () => PARAGRAPH).join('\n\n');
  const content =
    body ??
    `${PARAGRAPH}\n\n## What it does\n\n${filler}\n\n## When it helps\n\nSee [Spotify](https://support.spotify.com/a) and [Apple](https://artists.apple.com/b).\n\n## How Jovie handles it\n\nUse [Jovie Smart Links](/smart-links).\n`;
  return `---\n${Object.entries(fields)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n')}\n---\n\n${content}`;
}

const EMPTY_LEDGER: LaunchLedger = {
  contract: 'jovie.content-launch-ledger/v1',
  contentTypes: {},
};

describe('ideas', () => {
  it('picks relevant, uncovered questions and caps at three a day', () => {
    const ideas = selectAnswerIdeas(
      [
        entry('a', 3),
        entry('b', 1),
        entry('c', 2),
        entry('d', 2),
        entry('e', 3),
        entry('f', 3),
      ],
      { covered: ['c'], limit: 10 }
    );
    expect(ideas.map(idea => idea.questionId)).toEqual(['a', 'd', 'e']);
    expect(ideas).toHaveLength(MAX_IDEAS_PER_DAY);
    expect(ideas[0]).toMatchObject({
      medium: 'article',
      channel: 'blog',
      status: 'suggested',
    });
  });

  it('falls back to the live SERP when a question has no thread URL', () => {
    const [idea] = selectAnswerIdeas([entry('a', 3)]);
    expect(idea?.evidence).toEqual([
      {
        platform: 'google_paa',
        url: 'https://www.google.com/search?q=Question%20a%3F',
      },
    ]);
    expect(ideaIssueBody(idea!)).toContain('<!-- content-idea');
  });
});

describe('script certification', () => {
  it('passes a complete answer article with kernel receipts', () => {
    const result = certifyAnswerScript('what-is-a-smart-link', script());
    expect(result.checks.filter(item => item.status === 'failed')).toEqual([]);
    expect(
      scriptReceipts(result, 'sha').map(receipt => [receipt.id, receipt.status])
    ).toEqual([
      ['seo.technical', 'passed'],
      ['seo.agentic', 'passed'],
      ['seo.copy', 'passed'],
    ]);
  });

  it.each([
    ['frontmatter', script({ frontmatter: { question: '' } })],
    ['content-type', script({ frontmatter: { contentType: 'essay' } })],
    ['description', script({ frontmatter: { description: 'Too short.' } })],
    ['answer-depth', script({ body: `${PARAGRAPH}\n\n[a](/smart-links)` })],
    [
      'copy-lint',
      script({
        frontmatter: { title: 'Smart links — explained for musicians' },
      }),
    ],
  ])('fails %s', (id, raw) => {
    const result = certifyAnswerScript('slug', raw);
    expect(result.passed).toBe(false);
    expect(result.checks.find(item => item.id === id)?.status).toBe('failed');
    expect(
      scriptReceipts(result, null).some(receipt => receipt.status === 'failed')
    ).toBe(true);
  });

  it('fails a bad slug, missing citations, a missing product link, and a weak opener', () => {
    const result = certifyAnswerScript(
      'Bad_Slug',
      script({
        body: `Short opener.\n\n## One\n\n## Two\n\n## Three\n\n${Array.from({ length: 16 }, () => PARAGRAPH).join('\n\n')}`,
      })
    );
    const failed = result.checks
      .filter(item => item.status === 'failed')
      .map(item => item.id);
    expect(failed).toEqual(
      expect.arrayContaining([
        'slug',
        'citations',
        'product-link',
        'direct-answer',
      ])
    );
  });

  it('certifies every checked-in answer draft and published answer article', () => {
    for (const directory of [PATHS.drafts, PATHS.blog]) {
      for (const name of readdirSync(directory).filter(file =>
        file.endsWith('.md')
      )) {
        const raw = readFileSync(join(directory, name), 'utf8');
        if (!/^contentType:\s*answer-article/m.test(raw)) continue;
        const result = certifyAnswerScript(name.replace(/\.md$/, ''), raw);
        expect(
          result.checks.filter(item => item.status === 'failed'),
          name
        ).toEqual([]);
      }
    }
  });
});

describe('publish gate', () => {
  const base = {
    contentType: 'answer-article' as const,
    medium: 'article' as const,
    channel: 'blog' as const,
    slug: 'next',
    certified: true,
    judged: true,
  };

  function ledgerWith(approvals: number, passes: number, failLast = false) {
    let ledger: LaunchLedger = {
      contract: 'jovie.content-launch-ledger/v1',
      contentTypes: {
        'answer-article': {
          founderApprovals: Array.from({ length: approvals }, (_, index) => ({
            slug: `approved-${index}`,
            approvedAt: '2026-09-27T00:00:00Z',
            issue: `JOV-${index}`,
          })),
          certifications: [],
        },
      },
    };
    for (let index = 0; index < passes; index++) {
      ledger = recordCertification(ledger, 'answer-article', {
        slug: `s${index}`,
        passed: true,
        at: '2026-09-27T00:00:00Z',
      });
    }
    if (failLast) {
      ledger = recordCertification(ledger, 'answer-article', {
        slug: 'bad',
        passed: false,
        at: '2026-09-27T00:00:00Z',
      });
    }
    return ledger;
  }

  it('blocks disabled channels and uncertified scripts', () => {
    expect(
      decideLaunch({ ...base, channel: 'tiktok', ledger: EMPTY_LEDGER })
        .decision
    ).toBe('blocked');
    expect(isLaunchEnabled('podcast_episode', 'podcast')).toBe(false);
    expect(
      decideLaunch({ ...base, certified: false, ledger: EMPTY_LEDGER }).decision
    ).toBe('blocked');
  });

  it('needs a founder approval for the first launch of a type', () => {
    expect(decideLaunch({ ...base, ledger: EMPTY_LEDGER })).toEqual({
      decision: 'needs_founder_approval',
      reason: 'first answer-article launch needs one founder approval',
    });
  });

  it('publishes the exact script the founder approved', () => {
    expect(
      decideLaunch({ ...base, slug: 'approved-0', ledger: ledgerWith(1, 0) })
        .decision
    ).toBe('auto_publish');
  });

  it('auto-publishes after one approval and a 10/10 streak with a judge receipt', () => {
    expect(
      decideLaunch({ ...base, ledger: ledgerWith(1, AUTO_PUBLISH_STREAK - 1) })
        .reason
    ).toBe('certification streak 9/10');
    expect(
      decideLaunch({ ...base, ledger: ledgerWith(1, AUTO_PUBLISH_STREAK) })
        .decision
    ).toBe('auto_publish');
    expect(
      decideLaunch({
        ...base,
        judged: false,
        ledger: ledgerWith(1, AUTO_PUBLISH_STREAK),
      }).reason
    ).toBe('standard-tier copy judge receipt missing');
  });

  it('resets the streak on a failed certification', () => {
    const ledger = ledgerWith(1, 12, true);
    expect(
      certificationStreak(ledger.contentTypes['answer-article']!.certifications)
    ).toBe(0);
    expect(decideLaunch({ ...base, ledger }).decision).toBe(
      'needs_founder_approval'
    );
  });

  it('starts an empty content type on first record', () => {
    const ledger = recordCertification(EMPTY_LEDGER, 'answer-article', {
      slug: 'x',
      passed: true,
      at: '2026-09-27T00:00:00Z',
    });
    expect(ledger.contentTypes['answer-article']?.certifications).toHaveLength(
      1
    );
  });
});

describe('pipeline helpers', () => {
  it('collects questionIds from draft and published frontmatter', () => {
    const directory = mkdtempSync(join(tmpdir(), 'answers-'));
    writeFileSync(
      join(directory, 'a.md'),
      '---\nquestionId: link-smart-used\n---\n'
    );
    writeFileSync(join(directory, 'b.md'), '---\ntitle: x\n---\n');
    writeFileSync(join(directory, 'c.txt'), 'questionId: ignored');
    expect(coveredQuestionIds([directory, join(directory, 'missing')])).toEqual(
      ['link-smart-used']
    );
  });
});
