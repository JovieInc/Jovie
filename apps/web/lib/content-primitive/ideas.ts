import type { QuestionMapEntry } from '@/lib/answer-content/question-map';
import { CONTENT_PRIMITIVE_CONTRACT, type ContentIdea } from './contract';

/** Summer surfaces at most this many ideas a day as Ovie cards. */
export const MAX_IDEAS_PER_DAY = 3;

/**
 * Pick the next answer-article ideas from the question map: Jovie-relevant
 * (score >= 2), not already covered by a published or drafted slug, and not
 * already open as an idea. Highest priority first, capped per day.
 */
export function selectAnswerIdeas(
  entries: readonly QuestionMapEntry[],
  {
    covered = [],
    limit = MAX_IDEAS_PER_DAY,
  }: { readonly covered?: readonly string[]; readonly limit?: number } = {}
): ContentIdea[] {
  const taken = new Set(covered);
  const ideas: ContentIdea[] = [];
  for (const entry of entries) {
    if (ideas.length >= Math.min(limit, MAX_IDEAS_PER_DAY)) break;
    if (entry.jovieRelevance.score < 2 || taken.has(entry.id)) continue;
    taken.add(entry.id);
    ideas.push({
      contract: CONTENT_PRIMITIVE_CONTRACT,
      id: `answer:${entry.id}`,
      contentType: 'answer-article',
      title: entry.question.replace(/\?$/, ''),
      angle: `Answer "${entry.question}" better than the current top result (${entry.answerGap.gap.replaceAll('_', ' ')}).`,
      topicFamily: 'artist_industry',
      pillars: ['jovie_brand', 'artist_growth'],
      character: 'jovie_company',
      medium: 'article',
      channel: 'blog',
      questionId: entry.id,
      question: entry.question,
      // Google PAA questions carry no thread URL; point at the live SERP.
      evidence:
        entry.sources.length > 0
          ? entry.sources.map(source => ({
              url: source.url,
              platform: source.platform,
            }))
          : entry.platforms.map(platform => ({
              platform,
              url: `https://www.google.com/search?q=${encodeURIComponent(entry.question)}`,
            })),
      jovieLinks: entry.jovieRelevance.productPaths,
      status: 'suggested',
    });
  }
  return ideas;
}

/** Body for the Linear `content:idea` issue Summer turns into an Ovie card. */
export function ideaIssueBody(idea: ContentIdea): string {
  return [
    `**Idea:** ${idea.title}`,
    `**Angle:** ${idea.angle}`,
    `**Medium / channel:** ${idea.medium} to ${idea.channel}`,
    `**Jovie pages to link:** ${idea.jovieLinks.join(', ') || 'none'}`,
    '',
    '**Where people ask it:**',
    ...idea.evidence.map(item => `- ${item.platform}: ${item.url}`),
    '',
    'Approve to have it scripted. Reject to drop it from the map.',
    '',
    `<!-- content-idea ${JSON.stringify({ id: idea.id, contract: idea.contract, questionId: idea.questionId })} -->`,
  ].join('\n');
}
