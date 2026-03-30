import { KNOWLEDGE_TOPICS } from './topics';

export interface SelectedKnowledgeContext {
  readonly content: string;
  readonly topicIds: string[];
  readonly hasVolatileTopics: boolean;
  readonly cautions: string[];
}

/**
 * Maximum number of topic documents to inject per request.
 * Each topic is ~1,000-1,300 words (~1,500-2,000 tokens).
 * Cap at 2 to stay under ~4,000 tokens of knowledge context.
 */
const MAX_TOPICS = 2;

/**
 * Minimum keyword score to consider a topic relevant.
 * Prevents injecting marginally-related content.
 */
const MIN_SCORE = 2;

export const EMPTY_KNOWLEDGE_CONTEXT: SelectedKnowledgeContext = {
  content: '',
  topicIds: [],
  hasVolatileTopics: false,
  cautions: [],
};

/**
 * Check if a keyword matches in the message text.
 * Multi-word keywords use substring matching.
 * Single-word keywords use word-boundary matching to prevent
 * false positives (e.g., "ad" matching "had").
 */
function keywordMatches(text: string, keyword: string): boolean {
  if (keyword.includes(' ')) return text.includes(keyword);
  const boundary = new RegExp(`(?<![a-z])${keyword}(?![a-z])`, 'i');
  return boundary.test(text);
}

/**
 * Select relevant knowledge topics based on the user's message.
 *
 * Returns the concatenated content of the top matching topics,
 * or an empty string if no topics are relevant.
 */
export function selectKnowledgeContext(
  message: string
): SelectedKnowledgeContext {
  if (!message || message.length < 3) return EMPTY_KNOWLEDGE_CONTEXT;

  const lower = message.toLowerCase();

  const scored = KNOWLEDGE_TOPICS.filter(topic => topic.content.length > 0)
    .map(topic => {
      let score = 0;
      for (const keyword of topic.keywords) {
        if (keywordMatches(lower, keyword.toLowerCase())) {
          score++;
          if (keyword.includes(' ')) score++;
        }
      }
      return { topic, score };
    })
    .filter(s => s.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_TOPICS);

  if (scored.length === 0) return EMPTY_KNOWLEDGE_CONTEXT;

  const selectedTopics = scored.map(s => s.topic);

  return {
    content: selectedTopics.map(topic => topic.content).join('\n\n---\n\n'),
    topicIds: selectedTopics.map(topic => topic.id),
    hasVolatileTopics: selectedTopics.some(
      topic => topic.freshness === 'volatile'
    ),
    cautions: selectedTopics.flatMap(topic =>
      topic.caution ? [topic.caution] : []
    ),
  };
}
