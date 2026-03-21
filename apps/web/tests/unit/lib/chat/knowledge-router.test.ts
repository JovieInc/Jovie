import { describe, expect, it } from 'vitest';
import { selectKnowledgeContext } from '@/lib/chat/knowledge/router';

describe('selectKnowledgeContext', () => {
  it('returns empty string for empty message', () => {
    expect(selectKnowledgeContext('')).toBe('');
  });

  it('returns empty string for very short message', () => {
    expect(selectKnowledgeContext('hi')).toBe('');
  });

  it('returns empty string for non-music query', () => {
    expect(selectKnowledgeContext('what is the weather today?')).toBe('');
  });

  it('matches single keyword for music topic', () => {
    const result = selectKnowledgeContext('how do royalties work?');
    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain('Monetization');
  });

  it('matches multi-word keyword with bonus scoring', () => {
    const result = selectKnowledgeContext(
      'how much do streams pay per stream?'
    );
    expect(result.length).toBeGreaterThan(0);
  });

  it('does not match partial words via word-boundary check', () => {
    // "had" should not match any keyword, "providing" should not match "pro"
    const result = selectKnowledgeContext('I had a providing session');
    expect(result).toBe('');
  });

  it('returns at most MAX_TOPICS=2 topics', () => {
    // This message has keywords across many topics
    const result = selectKnowledgeContext(
      'I want to release my music, get on playlists, grow my streams, and earn royalties'
    );
    // Should have content but at most 2 topic separators
    expect(result.length).toBeGreaterThan(0);
    const separators = result.split('---').length - 1;
    expect(separators).toBeLessThanOrEqual(1); // 2 topics = 1 separator
  });

  it('matches copyright for music-rights topic', () => {
    const result = selectKnowledgeContext('what is copyright?');
    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain('Music Rights');
  });

  it('matches playlist for playlist-strategy topic', () => {
    const result = selectKnowledgeContext('how do I get on a playlist?');
    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain('Playlist');
  });

  it('matches distribution keywords', () => {
    const result = selectKnowledgeContext('what is an ISRC code?');
    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain('Distribution');
  });
});
