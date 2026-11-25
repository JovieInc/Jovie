import { describe, expect, it } from 'vitest';
import {
  artistAvatarTransitionName,
  artistTitleTransitionName,
  releaseCoverTransitionName,
  releaseTitleTransitionName,
  SITE_HEADER_TRANSITION_NAME,
} from './view-transition-names';

describe('view-transition-names', () => {
  it('builds stable artist and release names', () => {
    expect(artistAvatarTransitionName('timwhite')).toBe(
      'artist-avatar-timwhite'
    );
    expect(artistTitleTransitionName('timwhite')).toBe('artist-title-timwhite');
    expect(releaseCoverTransitionName('never-say')).toBe(
      'release-cover-never-say'
    );
    expect(releaseTitleTransitionName('never-say')).toBe(
      'release-title-never-say'
    );
    expect(SITE_HEADER_TRANSITION_NAME).toBe('site-header');
  });
});
