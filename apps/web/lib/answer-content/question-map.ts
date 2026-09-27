/**
 * Question map: what artists ask on Google, Reddit, YouTube, and TikTok,
 * normalized into ranked entries the answer-content pipeline writes against.
 *
 * Pure and deterministic. Collectors (scripts/answer-content/*) produce
 * `QuestionObservation`s from existing credits (SerpAPI, the last30days skill
 * on ScrapeCreators + yt-dlp, Exa via AI Gateway when its key budget allows);
 * this module extracts, clusters, and scores them. No model call happens here.
 */

export const QUESTION_MAP_CONTRACT = 'jovie.question-map/v1' as const;

export const QUESTION_PLATFORMS = [
  'google_paa',
  'google_related',
  'reddit',
  'reddit_comments',
  'youtube',
  'youtube_comments',
  'tiktok',
  'x',
] as const;
export type QuestionPlatform = (typeof QUESTION_PLATFORMS)[number];

export type QuestionIntent =
  | 'how_to'
  | 'decision'
  | 'comparison'
  | 'definition'
  | 'cost'
  | 'troubleshooting';

/** How well the current top answer serves the question. */
export type AnswerGap =
  | 'forum_only'
  | 'vendor_pitch'
  | 'thin'
  | 'covered'
  | 'unknown';

export interface AnswerSource {
  readonly title: string;
  readonly url: string;
  readonly snippet?: string;
}

export interface QuestionObservation {
  readonly question: string;
  readonly platform: QuestionPlatform;
  readonly topic: string;
  readonly url: string | null;
  /** Views, upvotes, comments, likes: any public engagement count. */
  readonly engagement: number;
  readonly observedAt: string;
  readonly answerSource?: AnswerSource | null;
}

export interface JovieRelevance {
  /** 0 none, 1 adjacent, 2 Jovie helps, 3 Jovie is the direct answer. */
  readonly score: 0 | 1 | 2 | 3;
  readonly productPaths: readonly string[];
}

export interface QuestionMapEntry {
  readonly id: string;
  readonly question: string;
  readonly variants: readonly string[];
  readonly topic: string;
  readonly platforms: readonly QuestionPlatform[];
  readonly sources: readonly {
    readonly platform: QuestionPlatform;
    readonly url: string;
  }[];
  readonly observations: number;
  readonly engagementProxy: number;
  readonly intent: QuestionIntent;
  readonly answerGap: {
    readonly gap: AnswerGap;
    readonly topAnswer: AnswerSource | null;
  };
  readonly jovieRelevance: JovieRelevance;
  readonly priority: number;
}

export interface QuestionMap {
  readonly contract: typeof QUESTION_MAP_CONTRACT;
  readonly generatedAt: string;
  readonly domain: 'artist-growth';
  readonly collection: {
    readonly platforms: Readonly<Partial<Record<QuestionPlatform, number>>>;
    readonly unavailable: readonly string[];
  };
  readonly entries: readonly QuestionMapEntry[];
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

const QUESTION_OPENERS =
  /^(how|what|why|should|can|is|are|does|do|where|when|which|who|any|anyone|has|have|will|would|could)\b/i;

const MIN_WORDS = 4;
const MAX_WORDS = 18;

/** Artist-growth vocabulary: a question must mention at least one. */
const DOMAIN_TERMS =
  /\b(music|song|single|album|ep|release|releasing|artist|musician|band|rapper|producer|singer|spotify|apple music|playlist|stream|streams|listeners|fans?|fanbase|followers|tiktok|youtube|instagram|merch|gig|gigs|show|shows|tour|booking|booked|venue|label|distribut\w*|pre-?save|smart link|link in bio|epk|press kit|pitch\w*|promot\w*|marketing|royalt\w*|radio|blog|email list|newsletter|subscribers)\b/i;

function cleanText(value: string): string {
  return value
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Creator titles carry years, parentheticals, and channel tails that are not the question. */
function stripTitleNoise(sentence: string): string {
  return sentence
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .replace(/\s[|/]{1,2}\s.*$/, '')
    .replace(/\b(in )?20\d\d\b/gi, ' ')
    .replace(/[!.?\s]+$/, '')
    .replace(/\s+(in|for|on|of|to|with)$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * First-person brag titles, replies, hashtag captions, and spoken transcript
 * fragments are not questions.
 */
const NOT_A_QUESTION =
  /^(how i|how we|replying to|i |i'm|we |and |but |so |or )|#|@|\b(um|uh|y'all|you guys)\b/i;

/**
 * Question-shaped sentences from a title, comment, or snippet. `strict`
 * (bodies, comments, captions) accepts only sentences that end in `?`;
 * titles may also qualify by opening like a question ("How to ...").
 */
export function extractQuestions(
  text: string,
  { strict = false }: { readonly strict?: boolean } = {}
): string[] {
  const questions: string[] = [];
  for (const raw of cleanText(text).split(/(?<=[?.!])\s+/)) {
    const trimmed = raw.trim().replace(/^["']+|["']+$/g, '');
    if (NOT_A_QUESTION.test(trimmed)) continue;
    const endsWithQuestion = trimmed.endsWith('?');
    const sentence = stripTitleNoise(trimmed);
    const words = sentence.split(/\s+/).filter(Boolean);
    if (words.length < MIN_WORDS || words.length > MAX_WORDS) continue;
    const isQuestion =
      endsWithQuestion || (!strict && QUESTION_OPENERS.test(sentence));
    if (!isQuestion || !DOMAIN_TERMS.test(sentence)) continue;
    questions.push(`${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}?`);
  }
  return questions;
}

// ---------------------------------------------------------------------------
// Normalization + clustering
// ---------------------------------------------------------------------------

const STOPWORDS = new Set(
  'a an the to for of on in and or my i me we our you your is are do does can how what why should it its this that be with as at by from get getting any anyone there their them they has have will would could just really best way ways good tips'.split(
    ' '
  )
);

const SYNONYMS: Readonly<Record<string, string>> = {
  songs: 'song',
  tracks: 'song',
  track: 'song',
  singles: 'song',
  single: 'song',
  musicians: 'artist',
  musician: 'artist',
  artists: 'artist',
  bands: 'artist',
  band: 'artist',
  playlists: 'playlist',
  fans: 'fan',
  fanbase: 'fan',
  followers: 'fan',
  listeners: 'listener',
  gigs: 'gig',
  shows: 'gig',
  show: 'gig',
  promoting: 'promote',
  promotion: 'promote',
  releasing: 'release',
  releases: 'release',
  pitching: 'pitch',
  presave: 'pre-save',
  presaves: 'pre-save',
};

export function questionTokens(question: string): string[] {
  const tokens = question
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .map(token => SYNONYMS[token] ?? token)
    .filter(token => token.length > 1 && !STOPWORDS.has(token));
  return [...new Set(tokens)].sort();
}

function jaccard(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setB = new Set(b);
  const shared = a.filter(token => setB.has(token)).length;
  return shared / (a.length + b.length - shared);
}

export function questionId(question: string): string {
  return questionTokens(question).slice(0, 8).join('-').slice(0, 80) || 'q';
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

export function classifyIntent(question: string): QuestionIntent {
  const q = question.toLowerCase();
  if (
    /\b(vs\.?|versus|better than|compared to|alternatives? to)\b/.test(q) ||
    /^which\b.*\bor\b/.test(q)
  )
    return 'comparison';
  if (/\b(cost|price|pay|worth|money|cheap|free|budget|\$)\b/.test(q))
    return 'cost';
  if (
    /\b(not working|won't|wont|doesn't|isn't|stuck|problem|error|why (is|are|does|do|did))\b/.test(
      q
    )
  )
    return 'troubleshooting';
  if (/^(what is|what are|what's|whats)\b/.test(q)) return 'definition';
  if (/^(should|is|are|do i need|when|which)\b/.test(q)) return 'decision';
  return 'how_to';
}

const RELEVANCE_RULES: readonly {
  readonly pattern: RegExp;
  readonly score: 1 | 2 | 3;
  readonly paths: readonly string[];
}[] = [
  {
    pattern:
      /\b(smart link|pre-?save|release link|landing page for (my )?(song|single|release))\b/i,
    score: 3,
    paths: ['/smart-links'],
  },
  {
    pattern:
      /\b(link in bio|linktree|linkfire|bio link|artist website|website for (my )?music)\b/i,
    score: 3,
    paths: ['/artist-profiles', '/alternatives/linktree'],
  },
  {
    pattern:
      /\b(release|releasing|rollout|drop|launch)\b.*\b(song|single|album|ep|music)\b|\b(song|single|album|ep|music)\b.*\b(release|rollout|launch)\b/i,
    score: 2,
    paths: ['/launch', '/smart-links'],
  },
  {
    pattern:
      /\b(email list|mailing list|newsletter|notify|reach (my )?fans|own (my )?fans|contact (my )?fans)\b/i,
    score: 3,
    paths: ['/artist-notifications', '/artist-profiles'],
  },
  {
    pattern: /\b(fan|fanbase|superfan|monthly listener|listeners|audience)\b/i,
    score: 2,
    paths: ['/artist-profiles', '/artist-notifications'],
  },
  {
    pattern: /\b(booking|booked|booking agent|gig|venue|tour|promoter)\b/i,
    score: 2,
    paths: ['/artist-profiles', '/blog/the-contact-problem'],
  },
  { pattern: /\b(youtube)\b/i, score: 2, paths: ['/youtube-thumbnails'] },
  {
    pattern: /\b(merch|t-?shirt|shirts)\b/i,
    score: 2,
    paths: ['/instant-merch'],
  },
  {
    pattern: /\b(tip|tips jar|busk|busking|qr code|cash app|venmo)\b/i,
    score: 2,
    paths: ['/pay'],
  },
  {
    pattern:
      /\b(playlist|pitch|editorial|spotify for artists|algorithm|release radar|discover weekly)\b/i,
    score: 1,
    paths: ['/launch'],
  },
  {
    pattern:
      /\b(promote|marketing|tiktok|instagram|grow|blow up|get discovered)\b/i,
    score: 1,
    paths: ['/artist-profiles'],
  },
];

export function scoreJovieRelevance(question: string): JovieRelevance {
  let score: 0 | 1 | 2 | 3 = 0;
  const paths: string[] = [];
  for (const rule of RELEVANCE_RULES) {
    if (!rule.pattern.test(question)) continue;
    if (rule.score > score) score = rule.score;
    for (const path of rule.paths) if (!paths.includes(path)) paths.push(path);
  }
  return { score, productPaths: paths.slice(0, 3) };
}

const FORUM_HOSTS =
  /(^|\.)(reddit\.com|quora\.com|facebook\.com|gearspace\.com|kvraudio\.com|stackexchange\.com|tiktok\.com)$/;
const VENDOR_HOSTS =
  /(^|\.)(distrokid\.com|tunecore\.com|cdbaby\.com|ditto\.music|dittomusic\.com|linktr\.ee|linkfire\.com|feature\.fm|toneden\.io|submithub\.com|groover\.co|playlistpush\.com|amuse\.io|landr\.com|symphonic\.com|unitedmasters\.com|soundcampaign\.com)$/;

/** Rule-based gap: who owns the top answer today. */
export function classifyAnswerGap(
  top: AnswerSource | null | undefined
): AnswerGap {
  if (!top) return 'unknown';
  let host = '';
  try {
    host = new URL(top.url).hostname.replace(/^www\./, '');
  } catch {
    return 'unknown';
  }
  if (FORUM_HOSTS.test(host)) return 'forum_only';
  if (VENDOR_HOSTS.test(host)) return 'vendor_pitch';
  if ((top.snippet ?? '').split(/\s+/).filter(Boolean).length < 12)
    return 'thin';
  return 'covered';
}

const GAP_WEIGHT: Readonly<Record<AnswerGap, number>> = {
  forum_only: 1.4,
  vendor_pitch: 1.3,
  thin: 1.25,
  unknown: 1.1,
  covered: 0.8,
};

const PLATFORM_WEIGHT: Readonly<Record<QuestionPlatform, number>> = {
  google_paa: 1.5,
  google_related: 1.2,
  reddit: 1.2,
  reddit_comments: 1,
  youtube: 1.1,
  youtube_comments: 1,
  tiktok: 1,
  x: 1,
};

/**
 * Priority = demand x gap x relevance. Demand is log-scaled engagement plus
 * cross-platform breadth, so one viral video cannot outrank a question asked
 * everywhere.
 */
export function priorityScore(entry: {
  readonly engagementProxy: number;
  readonly platforms: readonly QuestionPlatform[];
  readonly observations: number;
  readonly gap: AnswerGap;
  readonly relevance: number;
}): number {
  const demand =
    Math.log10(entry.engagementProxy + 10) +
    entry.platforms.reduce(
      (sum, platform) => sum + PLATFORM_WEIGHT[platform],
      0
    ) +
    Math.min(entry.observations, 6) * 0.25;
  const relevance = [0.3, 0.8, 1.2, 1.6][entry.relevance] ?? 0.3;
  return Math.round(demand * GAP_WEIGHT[entry.gap] * relevance * 100) / 100;
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

const CLUSTER_THRESHOLD = 0.6;

interface Cluster {
  readonly tokens: string[];
  readonly members: QuestionObservation[];
}

export function buildQuestionMap(
  observations: readonly QuestionObservation[],
  {
    generatedAt = new Date().toISOString(),
    unavailable = [],
    limit = 500,
  }: {
    readonly generatedAt?: string;
    readonly unavailable?: readonly string[];
    readonly limit?: number;
  } = {}
): QuestionMap {
  const clusters: Cluster[] = [];
  const platformCounts: Partial<Record<QuestionPlatform, number>> = {};
  // Higher-engagement phrasings seed clusters first and become the canonical wording.
  const ordered = [...observations].sort((a, b) => b.engagement - a.engagement);
  for (const observation of ordered) {
    platformCounts[observation.platform] =
      (platformCounts[observation.platform] ?? 0) + 1;
    const tokens = questionTokens(observation.question);
    if (tokens.length < 2) continue;
    const match = clusters.find(
      cluster => jaccard(cluster.tokens, tokens) >= CLUSTER_THRESHOLD
    );
    if (match) match.members.push(observation);
    else clusters.push({ tokens, members: [observation] });
  }

  const entries = clusters.map((cluster): QuestionMapEntry => {
    const [lead] = cluster.members as [QuestionObservation];
    const platforms = [
      ...new Set(cluster.members.map(member => member.platform)),
    ].sort();
    const engagementProxy = cluster.members.reduce(
      (sum, member) => sum + member.engagement,
      0
    );
    const topAnswer =
      cluster.members.find(member => member.answerSource)?.answerSource ?? null;
    const gap = classifyAnswerGap(topAnswer);
    const allText = cluster.members.map(member => member.question).join(' ');
    const relevance = scoreJovieRelevance(allText);
    const sources = cluster.members
      .filter((member): member is QuestionObservation & { url: string } =>
        Boolean(member.url)
      )
      .map(member => ({ platform: member.platform, url: member.url }))
      .filter(
        (source, index, all) =>
          all.findIndex(other => other.url === source.url) === index
      )
      .slice(0, 5);
    return {
      id: questionId(lead.question),
      question: lead.question,
      variants: [...new Set(cluster.members.map(member => member.question))]
        .filter(variant => variant !== lead.question)
        .slice(0, 4),
      topic: lead.topic,
      platforms,
      sources,
      observations: cluster.members.length,
      engagementProxy,
      intent: classifyIntent(lead.question),
      // Snippets rank the gap at build time; the committed map keeps only title + URL.
      answerGap: {
        gap,
        topAnswer: topAnswer
          ? { title: topAnswer.title, url: topAnswer.url }
          : null,
      },
      jovieRelevance: relevance,
      priority: priorityScore({
        engagementProxy,
        platforms,
        observations: cluster.members.length,
        gap,
        relevance: relevance.score,
      }),
    };
  });

  const seen = new Set<string>();
  const unique = entries
    .sort((a, b) => b.priority - a.priority)
    .filter(entry => {
      if (seen.has(entry.id)) return false;
      seen.add(entry.id);
      return true;
    })
    .slice(0, limit);

  return {
    contract: QUESTION_MAP_CONTRACT,
    generatedAt,
    domain: 'artist-growth',
    collection: { platforms: platformCounts, unavailable },
    entries: unique,
  };
}
