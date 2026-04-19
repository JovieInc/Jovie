import { describe, expect, it } from 'vitest';
import {
  getProfileMode,
  getProfileModeDefinition,
  getProfileModeHref,
  getProfileModePath,
  getProfileModeSubtitle,
  isProfileMode,
  profileModes,
} from '@/features/profile/registry';

describe('profile registry', () => {
  it('exposes the full current mode set', () => {
    expect(profileModes).toEqual([
      'profile',
      'listen',
      'pay',
      'subscribe',
      'about',
      'contact',
      'tour',
      'releases',
    ]);
  });

  it('resolves unknown values to profile mode', () => {
    expect(getProfileMode('unknown')).toBe('profile');
    expect(getProfileMode(undefined)).toBe('profile');
  });

  it('returns typed metadata for known modes', () => {
    expect(getProfileModeDefinition('listen')).toMatchObject({
      mode: 'listen',
      subtitle: 'Listen now',
      pathSegment: 'listen',
    });
    expect(getProfileModeDefinition('tour').shell.showBackButton).toBe(true);
  });

  it('builds query and path URLs from the registry', () => {
    expect(getProfileModeHref('dua-lipa', 'profile')).toBe('/dua-lipa');
    expect(getProfileModeHref('dua-lipa', 'tour', '&source=qr')).toBe(
      '/dua-lipa?mode=tour&source=qr'
    );
    expect(getProfileModePath('dua-lipa', 'listen')).toBe('/dua-lipa/listen');
  });

  it('provides subtitles from the registry', () => {
    expect(getProfileModeSubtitle('about')).toBe('About');
    expect(getProfileModeSubtitle('unknown')).toBe('Artist');
  });

  it('validates mode membership', () => {
    expect(isProfileMode('subscribe')).toBe(true);
    expect(isProfileMode('default')).toBe(false);
  });
});
