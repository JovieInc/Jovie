import { describe, expect, it } from 'vitest';
import {
  getReleaseTypeStyle,
  RELEASE_TYPE_STYLES,
} from '@/lib/discography/release-type-styles';

describe('release-type-styles', () => {
  it('has a music_video style entry', () => {
    const style = RELEASE_TYPE_STYLES.music_video;
    expect(style).toBeDefined();
    expect(style.label).toBe('Music Video');
    expect(style.dot).toBeTruthy();
    expect(style.text).toBeTruthy();
    expect(style.bg).toBeTruthy();
    expect(style.border).toBeTruthy();
  });

  it('getReleaseTypeStyle returns music_video style', () => {
    const style = getReleaseTypeStyle('music_video');
    expect(style.label).toBe('Music Video');
  });
});
