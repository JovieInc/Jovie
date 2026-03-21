import { KNOWLEDGE_TOPICS } from './topics';

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

/**
 * Select relevant knowledge topics based on the user's message.
 *
 * Returns the concatenated content of the top matching topics,
 * or an empty string if no topics are relevant.
 */
export function selectKnowledgeContext(message: string): string {
  if (!message || message.length < 3) return '';

  const lower = message.toLowerCase();

  const scored = KNOWLEDGE_TOPICS.map(topic => {
    let score = 0;
    for (const keyword of topic.keywords) {
      if (lower.includes(keyword.toLowerCase())) {
        score++;
        // Bonus for multi-word keyword matches (more specific)
        if (keyword.includes(' ')) score++;
      }
    }
    return { topic, score };
  })
    .filter(s => s.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_TOPICS);

  if (scored.length === 0) return '';

  return scored
    .map(s => s.topic.content)
    .filter(Boolean)
    .join('\n\n---\n\n');
}
