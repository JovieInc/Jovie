import { describe, expect, it } from 'vitest';

import { selectKnowledgeContext } from '@/lib/chat/knowledge/router';

describe('selectKnowledgeContext', () => {
  // ---- Basic topic selection ----

  it('returns release-strategy content for release-related queries', () => {
    const result = selectKnowledgeContext(
      'When should I release my single? What is the best release date?'
    );
    expect(result.content).toBeTruthy();
    expect(result.topicIds).toContain('release-strategy');
  });

  it('returns playlist-strategy content for playlist queries', () => {
    const result = selectKnowledgeContext(
      'How do I get on a playlist? I want editorial playlist placement for my song.'
    );
    expect(result.content).toBeTruthy();
    expect(result.topicIds).toContain('playlist-strategy');
  });

  it('returns streaming-metrics content for streaming questions', () => {
    const result = selectKnowledgeContext(
      'How are streams counted? What counts as a stream on Spotify?'
    );
    expect(result.content).toBeTruthy();
    expect(result.topicIds).toContain('streaming-metrics');
    expect(result.hasVolatileTopics).toBe(true);
    expect(result.cautions.length).toBeGreaterThan(0);
  });

  it('returns monetization content for royalty/payment questions', () => {
    const result = selectKnowledgeContext(
      'How much do streams pay? What are royalties? How do I earn money?'
    );
    expect(result.content).toBeTruthy();
    expect(result.topicIds).toContain('monetization');
  });

  // ---- Threshold behavior ----

  it('returns empty string for queries below MIN_SCORE threshold', () => {
    // Single keyword match should be below MIN_SCORE of 2
    const result = selectKnowledgeContext('release');
    expect(result).toEqual({
      content: '',
      topicIds: [],
      hasVolatileTopics: false,
      cautions: [],
    });
  });

  it('returns empty string for unrelated queries', () => {
    const result = selectKnowledgeContext('Hello, who are you?');
    expect(result.content).toBe('');
  });

  it('returns empty string for very short input', () => {
    const result = selectKnowledgeContext('hi');
    expect(result.content).toBe('');
  });

  it('returns empty string for empty input', () => {
    const result = selectKnowledgeContext('');
    expect(result.content).toBe('');
  });

  // ---- Multi-topic selection ----

  it('selects at most 2 topics for multi-topic queries', () => {
    const result = selectKnowledgeContext(
      'I want to schedule my release date for new music on friday and also get editorial playlist placement with a playlist pitch submission'
    );
    expect(result.content).toBeTruthy();
    // The separator between topics is "---"
    const topicCount = result.content.split('---').length;
    expect(topicCount).toBeLessThanOrEqual(3); // At most 2 topics = at most 1 separator + original
    expect(result.topicIds.length).toBeLessThanOrEqual(2);
  });

  it('selects both release and playlist topics for combined queries', () => {
    const result = selectKnowledgeContext(
      'I want to schedule my release date for new music and get editorial playlist placement with a playlist pitch'
    );
    expect(result.content).toBeTruthy();
    // Should have content from multiple topics (indicated by separator)
    expect(result.content.length).toBeGreaterThan(500);
    expect(result.topicIds).toEqual(
      expect.arrayContaining(['release-strategy', 'playlist-strategy'])
    );
  });

  // ---- Word boundary matching ----

  it('does not match single-word keywords as substrings', () => {
    // "ad" should not match inside "had" or "bad" due to word boundary matching
    // This tests the regex boundary behavior
    const result = selectKnowledgeContext(
      'I had a bad day but nothing about advertising'
    );
    // Should not trigger marketing-promotion topic from "ad" alone
    expect(result.content).toBe('');
  });

  it('matches multi-word keywords as substrings', () => {
    // "pre-save" and "release date" are multi-word keywords that use substring matching
    const result = selectKnowledgeContext(
      'How do I set up a pre-save for my release date?'
    );
    expect(result.content).toBeTruthy();
  });

  // ---- Multi-turn concatenation simulation ----
  // Production concatenates the last 3 user messages before calling selectKnowledgeContext.
  // These tests verify the function works correctly with concatenated input.

  it('selects relevant topics from concatenated multi-turn messages', () => {
    const turn1 = 'I just finished recording my single.';
    const turn2 = 'What should I do next to release it?';
    const turn3 = 'How do I set up pre-saves and pick a release date?';
    const concatenated = `${turn1} ${turn2} ${turn3}`;

    const result = selectKnowledgeContext(concatenated);
    expect(result.content).toBeTruthy();
    expect(result.topicIds).toContain('release-strategy');
  });

  it('does not inject music knowledge for Jovie competitor chatter', () => {
    const result = selectKnowledgeContext(
      'Is Jovie better than another product for artist chat?'
    );

    expect(result.content).toBe('');
    expect(result.topicIds).toEqual([]);
  });
});
