import { describe, expect, it } from 'vitest';
import { buildPinnedOpportunityBlock } from './pinned-opportunity';

describe('buildPinnedOpportunityBlock', () => {
  it('returns undefined when pin is missing', () => {
    expect(buildPinnedOpportunityBlock(null)).toBeUndefined();
    expect(buildPinnedOpportunityBlock(undefined)).toBeUndefined();
    expect(
      buildPinnedOpportunityBlock({ id: '', title: '', why: '', typeLabel: '' })
    ).toBeUndefined();
  });

  it('includes card facts for model ground truth', () => {
    const block = buildPinnedOpportunityBlock({
      id: '11111111-1111-4111-8111-111111111111',
      title: 'Refresh weak YouTube thumbnails',
      why: '4 videos still use auto-generated thumbs',
      typeLabel: 'YouTube',
      primaryActionLabel: 'Generate variants',
      signalType: 'new_song',
    });

    expect(block).toContain('## Pinned opportunity');
    expect(block).toContain(
      'suggested_actions id: 11111111-1111-4111-8111-111111111111'
    );
    expect(block).toContain('Refresh weak YouTube thumbnails');
    expect(block).toContain('4 videos still use auto-generated thumbs');
    expect(block).toContain('Generate variants');
  });
});
