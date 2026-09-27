/**
 * Adapters from existing research sources to `QuestionObservation`s.
 *
 * - SerpAPI (existing SERPAPI_API_KEY, free plan: 250 searches a month shared
 *   with lead discovery, so collectors cap each run).
 * - The last30days skill JSON (`--emit json`): Reddit and TikTok through the
 *   existing ScrapeCreators key, YouTube titles and top comments through yt-dlp.
 * - Exa search results through AI Gateway (`gateway.tools.exaSearch`).
 *
 * All inputs are untrusted third-party text: they are parsed as data, never
 * followed as instructions.
 */
import {
  extractQuestions,
  type QuestionObservation,
  type QuestionPlatform,
} from './question-map';

/** Google shows PAA only for real query volume; treat presence as a demand floor. */
const PAA_ENGAGEMENT = 100;
const RELATED_SEARCH_ENGAGEMENT = 50;

type JsonRecord = Record<string, unknown>;

function records(value: unknown): JsonRecord[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is JsonRecord => typeof item === 'object' && item !== null
      )
    : [];
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function num(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[^\d.]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function observe(
  questions: readonly string[],
  base: Omit<QuestionObservation, 'question'>
): QuestionObservation[] {
  return questions.map(question => ({ ...base, question }));
}

/** SerpAPI `engine=google`: People Also Ask plus question-shaped related searches. */
export function observationsFromSerpGoogle(
  json: unknown,
  topic: string,
  observedAt: string
): QuestionObservation[] {
  const root = (json ?? {}) as JsonRecord;
  const observations: QuestionObservation[] = [];
  const organic = records(root.organic_results)[0];
  // PAA answers are often AI summaries with no link; the top organic result
  // is then the page that currently owns the answer.
  const topAnswer =
    organic && str(organic.link)
      ? {
          title: str(organic.title) ?? '',
          url: str(organic.link) as string,
          snippet: str(organic.snippet) ?? undefined,
        }
      : null;
  for (const item of records(root.related_questions)) {
    const question = str(item.question);
    if (!question) continue;
    const link = str(item.link);
    observations.push({
      question: question.endsWith('?') ? question : `${question}?`,
      platform: 'google_paa',
      topic,
      url: link,
      engagement: PAA_ENGAGEMENT,
      observedAt,
      answerSource: link
        ? {
            title: str(item.title) ?? question,
            url: link,
            snippet: str(item.snippet) ?? undefined,
          }
        : topAnswer,
    });
  }
  for (const item of records(root.related_searches)) {
    const query = str(item.query);
    if (!query) continue;
    observations.push(
      ...observe(extractQuestions(query), {
        platform: 'google_related',
        topic,
        url: null,
        engagement: RELATED_SEARCH_ENGAGEMENT,
        observedAt,
        answerSource: topAnswer,
      })
    );
  }
  return observations;
}

/** SerpAPI `engine=youtube`: question-shaped video titles, views as demand. */
export function observationsFromSerpYoutube(
  json: unknown,
  topic: string,
  observedAt: string
): QuestionObservation[] {
  const root = (json ?? {}) as JsonRecord;
  return records(root.video_results).flatMap(item =>
    observe(extractQuestions(str(item.title) ?? ''), {
      platform: 'youtube',
      topic,
      url: str(item.link),
      engagement: num(item.views),
      observedAt,
    })
  );
}

const LAST30DAYS_PLATFORMS: Readonly<
  Record<string, { post: QuestionPlatform; comments: QuestionPlatform }>
> = {
  reddit: { post: 'reddit', comments: 'reddit_comments' },
  youtube: { post: 'youtube', comments: 'youtube_comments' },
  tiktok: { post: 'tiktok', comments: 'tiktok' },
  x: { post: 'x', comments: 'x' },
};

function engagementOf(value: unknown): number {
  const record = (value ?? {}) as JsonRecord;
  return Object.values(record).reduce<number>(
    (sum, item) => sum + num(item),
    0
  );
}

/** last30days `--emit json`: post titles, bodies, and top comments. */
export function observationsFromLast30Days(
  json: unknown,
  observedAt: string
): QuestionObservation[] {
  const root = (json ?? {}) as JsonRecord;
  const topic = str(root.topic) ?? 'unknown';
  const bySource = (root.items_by_source ?? {}) as JsonRecord;
  const observations: QuestionObservation[] = [];
  for (const [source, value] of Object.entries(bySource)) {
    const platforms = LAST30DAYS_PLATFORMS[source];
    if (!platforms) continue;
    for (const item of records(value)) {
      const url = str(item.url);
      const engagement = engagementOf(item.engagement);
      const title = str(item.title) ?? '';
      const body = (str(item.body) ?? '').slice(0, 600);
      // TikTok titles are captions and transcripts: hold them to `?` sentences.
      const questions = [
        ...extractQuestions(title, { strict: source === 'tiktok' }),
        ...extractQuestions(body, { strict: true }),
      ];
      observations.push(
        ...observe([...new Set(questions)], {
          platform: platforms.post,
          topic,
          url,
          engagement,
          observedAt,
        })
      );
      const metadata = (item.metadata ?? {}) as JsonRecord;
      const comments = [
        ...(Array.isArray(metadata.comment_insights)
          ? metadata.comment_insights.map(text => ({ text, score: 0 }))
          : []),
        ...records(metadata.top_comments).map(comment => ({
          text: comment.excerpt,
          score: num(comment.score),
        })),
      ];
      for (const comment of comments) {
        const text = str(comment.text);
        if (!text) continue;
        observations.push(
          ...observe(extractQuestions(text, { strict: true }), {
            platform: platforms.comments,
            topic,
            url,
            engagement: comment.score,
            observedAt,
          })
        );
      }
    }
  }
  return observations;
}

/** Exa search response (`gateway.tools.exaSearch` output). */
export function observationsFromExa(
  json: unknown,
  topic: string,
  observedAt: string
): QuestionObservation[] {
  const root = (json ?? {}) as JsonRecord;
  return records(root.results).flatMap(item => {
    const url = str(item.url);
    let platform: QuestionPlatform = 'google_related';
    if (url?.includes('reddit.com')) platform = 'reddit';
    else if (url?.includes('youtube.com')) platform = 'youtube';
    else if (url?.includes('tiktok.com')) platform = 'tiktok';
    const highlights = Array.isArray(item.highlights)
      ? item.highlights.filter(
          (text): text is string => typeof text === 'string'
        )
      : [];
    return observe(
      extractQuestions([str(item.title) ?? '', ...highlights].join('. ')),
      { platform, topic, url, engagement: 0, observedAt }
    );
  });
}
