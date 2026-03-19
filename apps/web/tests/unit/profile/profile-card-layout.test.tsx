import { describe, expect, it } from 'vitest';
import {
  profileCardLayout,
  truncateText,
} from '@/lib/profile/profile-card-layout';

describe('truncateText', () => {
  it('returns string unchanged when within limit', () => {
    expect(truncateText('hello', 10)).toBe('hello');
  });

  it('truncates with ellipsis when over limit', () => {
    expect(truncateText('a very long name here', 10)).toBe('a very lo…');
  });
});

describe('profileCardLayout', () => {
  const baseData = {
    artistName: 'Test Artist',
    username: 'testartist',
    avatarUrl: 'https://example.com/avatar.jpg',
    genreTags: ['indie rock', 'alternative'],
    isPublic: true,
  };

  it('returns JSX for feed size (1080x1080)', () => {
    const result = profileCardLayout(baseData, { width: 1080, height: 1080 });
    expect(result).toBeTruthy();
    expect(result.props).toBeDefined();
  });

  it('returns JSX for story size (1080x1920)', () => {
    const result = profileCardLayout(baseData, { width: 1080, height: 1920 });
    expect(result).toBeTruthy();
    expect(result.props).toBeDefined();
  });

  it('returns JSX for OG size (1200x630)', () => {
    const result = profileCardLayout(baseData, { width: 1200, height: 630 });
    expect(result).toBeTruthy();
    expect(result.props).toBeDefined();
  });

  it('handles missing avatar with letter fallback', () => {
    const noAvatar = { ...baseData, avatarUrl: null };
    const result = profileCardLayout(noAvatar, { width: 1080, height: 1080 });
    expect(result).toBeTruthy();
  });

  it('handles long name with truncation', () => {
    const longName = {
      ...baseData,
      artistName: 'A Very Long Artist Name That Exceeds Thirty Two Characters',
    };
    const result = profileCardLayout(longName, { width: 1080, height: 1080 });
    expect(result).toBeTruthy();
  });

  it('handles empty genres with fallback', () => {
    const noGenres = { ...baseData, genreTags: [] };
    const result = profileCardLayout(noGenres, { width: 1080, height: 1080 });
    expect(result).toBeTruthy();
  });
});
