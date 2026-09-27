import { describe, expect, it } from 'vitest';
import {
  buildQuestionMap,
  classifyAnswerGap,
  classifyIntent,
  extractQuestions,
  priorityScore,
  type QuestionObservation,
  questionId,
  scoreJovieRelevance,
} from '@/lib/answer-content/question-map';
import {
  observationsFromExa,
  observationsFromLast30Days,
  observationsFromSerpGoogle,
  observationsFromSerpYoutube,
} from '@/lib/answer-content/question-sources';
import {
  observationsFromFile,
  serializeQuestionMap,
} from '@/scripts/answer-content/question-map';

const AT = '2026-09-27T00:00:00.000Z';

function obs(
  question: string,
  overrides: Partial<QuestionObservation> = {}
): QuestionObservation {
  return {
    question,
    platform: 'google_paa',
    topic: 'release strategy',
    url: null,
    engagement: 100,
    observedAt: AT,
    ...overrides,
  };
}

describe('extractQuestions', () => {
  it('keeps domain questions and cleans creator-title noise', () => {
    expect(
      extractQuestions('How To Release A Single In 2026 (The 25 Day Plan)')
    ).toEqual(['How To Release A Single?']);
    expect(
      extractQuestions('Should I pitch my song to playlists before release?')
    ).toEqual(['Should I pitch my song to playlists before release?']);
  });

  it('drops off-domain, first-person, hashtag, and transcript fragments', () => {
    expect(extractQuestions('What should I cook for dinner tonight?')).toEqual(
      []
    );
    expect(
      extractQuestions('How I got 50k monthly listeners on Spotify')
    ).toEqual([]);
    expect(extractQuestions('how to release an EP #musicindustrytips')).toEqual(
      []
    );
    expect(
      extractQuestions(
        'And if you visit, um, the artist dashboard, should I show you guys?'
      )
    ).toEqual([]);
  });

  it('accepts only ? sentences in strict mode', () => {
    expect(
      extractQuestions('How to promote music on TikTok', { strict: true })
    ).toEqual([]);
    expect(
      extractQuestions('Great video. How do you promote music on TikTok?', {
        strict: true,
      })
    ).toEqual(['How do you promote music on TikTok?']);
  });
});

describe('classification', () => {
  it.each([
    ['What is a smart link used for?', 'definition'],
    ['Is 1000 monthly listeners on Spotify a lot?', 'decision'],
    ['How much does a music booking agent cost?', 'cost'],
    ['Why is my song not showing up on my playlist?', 'troubleshooting'],
    ['Smart links vs link in bio for musicians?', 'comparison'],
    ['How do I release my first song?', 'how_to'],
  ] as const)('%s -> %s', (question, intent) => {
    expect(classifyIntent(question)).toBe(intent);
  });

  it('maps questions to the Jovie pages that answer them', () => {
    expect(scoreJovieRelevance('How do I create a smart link?')).toEqual({
      score: 3,
      productPaths: ['/smart-links'],
    });
    expect(scoreJovieRelevance('What is the best DAW for beginners?')).toEqual({
      score: 0,
      productPaths: [],
    });
  });

  it('classifies who owns the current answer', () => {
    expect(
      classifyAnswerGap({ title: 't', url: 'https://www.reddit.com/r/x' })
    ).toBe('forum_only');
    expect(
      classifyAnswerGap({ title: 't', url: 'https://distrokid.com/help' })
    ).toBe('vendor_pitch');
    expect(
      classifyAnswerGap({
        title: 't',
        url: 'https://example.com',
        snippet: 'short',
      })
    ).toBe('thin');
    expect(
      classifyAnswerGap({
        title: 't',
        url: 'https://example.com',
        snippet:
          'A long and specific answer that walks through every step of a release plan with dates and owners.',
      })
    ).toBe('covered');
    expect(classifyAnswerGap(null)).toBe('unknown');
    expect(classifyAnswerGap({ title: 't', url: 'not a url' })).toBe('unknown');
  });

  it('ranks breadth and gaps above a single covered mention', () => {
    const broad = priorityScore({
      engagementProxy: 500,
      platforms: ['google_paa', 'reddit', 'youtube'],
      observations: 4,
      gap: 'forum_only',
      relevance: 3,
    });
    const narrow = priorityScore({
      engagementProxy: 500,
      platforms: ['youtube'],
      observations: 1,
      gap: 'covered',
      relevance: 1,
    });
    expect(broad).toBeGreaterThan(narrow);
  });
});

describe('buildQuestionMap', () => {
  it('clusters phrasings, keeps the highest-engagement wording, and ranks', () => {
    const map = buildQuestionMap(
      [
        obs('How to release a single?', { engagement: 10 }),
        obs('How to release a single?', {
          platform: 'youtube',
          url: 'https://youtube.com/watch?v=1',
          engagement: 5000,
        }),
        obs('How do I create a smart link?', {
          answerSource: {
            title: 'thread',
            url: 'https://www.reddit.com/r/x',
            snippet: 'snippet text',
          },
        }),
        obs('Hi?'),
      ],
      { generatedAt: AT, unavailable: ['x: none'] }
    );
    expect(map.contract).toBe('jovie.question-map/v1');
    expect(map.collection).toEqual({
      platforms: { google_paa: 3, youtube: 1 },
      unavailable: ['x: none'],
    });
    const release = map.entries.find(
      entry => entry.id === questionId('How to release a single?')
    );
    expect(release).toMatchObject({
      platforms: ['google_paa', 'youtube'],
      observations: 2,
      engagementProxy: 5010,
      sources: [{ platform: 'youtube', url: 'https://youtube.com/watch?v=1' }],
    });
    const smartLink = map.entries.find(entry =>
      entry.question.includes('smart link')
    );
    expect(smartLink?.answerGap).toEqual({
      gap: 'forum_only',
      topAnswer: { title: 'thread', url: 'https://www.reddit.com/r/x' },
    });
    expect(map.entries.length).toBe(2);
  });
});

describe('source adapters', () => {
  it('reads SerpAPI PAA with the organic result as the fallback answer', () => {
    const observations = observationsFromSerpGoogle(
      {
        organic_results: [
          { title: 'Guide', link: 'https://example.com/guide', snippet: 's' },
        ],
        related_questions: [
          { question: 'How often should artists release music' },
          {
            question: 'What is a pre-save',
            link: 'https://www.reddit.com/r/y',
            title: 'r',
          },
        ],
        related_searches: [{ query: 'how to release a single on spotify' }, {}],
      },
      'release strategy',
      AT
    );
    expect(
      observations.map(item => [
        item.platform,
        item.question,
        item.answerSource?.url,
      ])
    ).toEqual([
      [
        'google_paa',
        'How often should artists release music?',
        'https://example.com/guide',
      ],
      ['google_paa', 'What is a pre-save?', 'https://www.reddit.com/r/y'],
      [
        'google_related',
        'How to release a single on spotify?',
        'https://example.com/guide',
      ],
    ]);
  });

  it('reads SerpAPI YouTube titles with views as engagement', () => {
    expect(
      observationsFromSerpYoutube(
        {
          video_results: [
            {
              title: 'How to Build an Email List for Musicians',
              link: 'https://y/1',
              views: '12,300',
            },
          ],
        },
        'fan growth',
        AT
      )
    ).toEqual([
      expect.objectContaining({
        platform: 'youtube',
        question: 'How to Build an Email List for Musicians?',
        engagement: 12300,
      }),
    ]);
  });

  it('reads last30days posts and comments, strict for comments and captions', () => {
    const observations = observationsFromLast30Days(
      {
        topic: 'fan growth',
        items_by_source: {
          reddit: [
            {
              title: 'How do I grow a fanbase as an independent artist',
              url: 'https://reddit.com/r/1',
              engagement: { score: 10, num_comments: 5 },
              metadata: {
                comment_insights: ['Should I start an email list first?'],
              },
            },
          ],
          youtube: [
            {
              title: 'Release strategy explained',
              url: 'https://youtube.com/1',
              engagement: { views: 1000 },
              metadata: {
                top_comments: [
                  {
                    excerpt: 'How do you pitch a song to playlists?',
                    score: 40,
                  },
                ],
              },
            },
          ],
          tiktok: [
            { title: 'how to promote music on tiktok', url: 'https://t/1' },
          ],
          unknown: [{ title: 'How to release a song?' }],
        },
      },
      AT
    );
    expect(
      observations.map(item => [item.platform, item.question, item.engagement])
    ).toEqual([
      ['reddit', 'How do I grow a fanbase as an independent artist?', 15],
      ['reddit_comments', 'Should I start an email list first?', 0],
      ['youtube_comments', 'How do you pitch a song to playlists?', 40],
    ]);
  });

  it('reads Exa results and routes platforms by host', () => {
    expect(
      observationsFromExa(
        {
          results: [
            {
              title: 'How do I get on playlists as an artist?',
              url: 'https://www.reddit.com/r/1',
            },
            {
              title: 'Notes',
              url: 'https://example.com',
              highlights: ['What is a smart link for music?'],
            },
          ],
        },
        'playlisting',
        AT
      ).map(item => [item.platform, item.question])
    ).toEqual([
      ['reddit', 'How do I get on playlists as an artist?'],
      ['google_related', 'What is a smart link for music?'],
    ]);
  });

  it('routes files to the SerpAPI or last30days adapter', () => {
    expect(
      observationsFromFile(
        [
          {
            topic: 't',
            engine: 'google',
            observedAt: AT,
            response: {
              related_questions: [{ question: 'How to release a song' }],
            },
          },
          {
            topic: 't',
            engine: 'youtube',
            observedAt: AT,
            response: { video_results: [] },
          },
        ],
        AT
      )
    ).toHaveLength(1);
    expect(
      observationsFromFile({ topic: 't', items_by_source: {} }, AT)
    ).toEqual([]);
  });
});

describe('serializeQuestionMap', () => {
  it('writes one entry per line and round-trips', () => {
    const map = buildQuestionMap(
      [obs('How to release a single?'), obs('How do I create a smart link?')],
      { generatedAt: AT }
    );
    const text = serializeQuestionMap(map);
    expect(text.split('\n')).toHaveLength(map.entries.length + 3);
    expect(JSON.parse(text)).toEqual(map);
  });
});
