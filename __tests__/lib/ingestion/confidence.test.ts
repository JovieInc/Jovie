import { describe, expect, it } from 'vitest';
import { computeLinkConfidence } from '@/lib/ingestion/confidence';

describe('computeLinkConfidence', () => {
  it('treats manual user submissions as active with strong confidence', () => {
    const result = computeLinkConfidence({
      sourceType: 'manual',
      signals: [],
      sources: ['dashboard'],
      usernameNormalized: 'artist',
      url: 'https://instagram.com/artist',
    });

    expect(result.state).toBe('active');
    expect(result.confidence).toBeGreaterThanOrEqual(0.75);
  });

  it('keeps lightweight ingested linktree hints as low confidence', () => {
    const result = computeLinkConfidence({
      sourceType: 'ingested',
      signals: ['linktree_profile_link'],
      sources: ['linktree'],
      url: 'https://linktr.ee/example',
    });

    expect(result.state).toBe('rejected');
    expect(result.confidence).toBeGreaterThan(0.1);
    expect(result.confidence).toBeLessThan(0.3);
  });

  it('promotes multi-signal ingested links to active when confidence is high', () => {
    const result = computeLinkConfidence({
      sourceType: 'ingested',
      signals: [
        'linktree_profile_link',
        'spotify_presence',
        'handle_similarity',
      ],
      sources: ['linktree', 'spotify'],
      usernameNormalized: 'example',
      url: 'https://linktr.ee/example',
    });

    expect(result.state).toBe('active');
    expect(result.confidence).toBeGreaterThanOrEqual(0.7);
  });
});
