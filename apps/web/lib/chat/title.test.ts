import { describe, expect, it } from 'vitest';
import {
  sanitizeConversationTitle,
  withSanitizedConversationTitle,
  withSanitizedConversationTitles,
} from './title';

describe('sanitizeConversationTitle', () => {
  it('preserves quoted subject names and apostrophes while removing a whole-title quote wrapper', () => {
    expect(sanitizeConversationTitle('Seaside Heights "Live"')).toBe(
      'Seaside Heights "Live"'
    );
    expect(sanitizeConversationTitle("'Tis a new release")).toBe(
      "'Tis a new release"
    );
    expect(sanitizeConversationTitle('"Seaside Heights"')).toBe(
      'Seaside Heights'
    );
  });

  it('truncates long Unicode titles at whole grapheme boundaries', () => {
    expect(sanitizeConversationTitle('👩🏽‍🎤'.repeat(10), 6)).toBe(
      '👩🏽‍🎤'.repeat(3) + '...'
    );
    expect(sanitizeConversationTitle('e\u0301'.repeat(10), 6)).toBe(
      'e\u0301'.repeat(3) + '...'
    );
  });

  it('renders skill and entity tokens as readable title text', () => {
    expect(
      sanitizeConversationTitle(
        '/skill:generateAlbumArt @release:rel_1[Midnight Drive] please'
      )
    ).toBe('Generate album art Midnight Drive please');
  });

  it('removes raw token syntax from fallback titles', () => {
    const title = sanitizeConversationTitle(
      'skill /skill:generateAlbumArt for @release:rel_1[Midnight Drive]'
    );

    expect(title).toBe('Generate album art for Midnight Drive');
    expect(title).not.toContain('/skill:');
    expect(title?.toLowerCase()).not.toContain('skill');
    expect(title).not.toContain('@release:');
  });

  it('sanitizes conversation records without duplicating response mapping', () => {
    expect(
      withSanitizedConversationTitle({
        id: 'conversation_1',
        title: '/skill:generateAlbumArt @release:rel_1[Midnight Drive]',
      })
    ).toEqual({
      id: 'conversation_1',
      title: 'Generate album art Midnight Drive',
    });

    expect(
      withSanitizedConversationTitles([
        { id: 'conversation_2', title: 'skill /skill:openTask' },
      ])
    ).toEqual([{ id: 'conversation_2', title: 'Open task' }]);
  });
});
