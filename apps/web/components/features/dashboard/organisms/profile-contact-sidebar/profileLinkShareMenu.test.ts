import { describe, expect, it } from 'vitest';
import type { UTMPreset } from '@/lib/utm';
import { groupPresetsByPlatform } from './profileLinkShareMenu';

describe('groupPresetsByPlatform', () => {
  it('groups presets with the same source and sorts labels', () => {
    const presets: UTMPreset[] = [
      {
        id: 'twitter-bio',
        label: 'Twitter Bio',
        icon: 'Twitter',
        params: { utm_source: 'twitter', utm_medium: 'social' },
      },
      {
        id: 'instagram-story',
        label: 'Instagram Story',
        icon: 'Instagram',
        params: { utm_source: 'instagram', utm_medium: 'social' },
      },
      {
        id: 'twitter-post',
        label: 'Twitter Post',
        icon: 'Twitter',
        params: { utm_source: 'twitter', utm_medium: 'social' },
      },
    ];

    const groups = groupPresetsByPlatform(presets);

    expect(groups).toHaveLength(2);
    expect(groups[0]?.source).toBe('instagram');
    expect(groups[1]?.source).toBe('twitter');
    expect(groups[1]?.presets.map(preset => preset.id)).toEqual([
      'twitter-bio',
      'twitter-post',
    ]);
  });

  it('ignores presets without utm_source values', () => {
    const presets: UTMPreset[] = [
      {
        id: 'missing-source',
        label: 'Missing source',
        icon: 'Link2',
        params: { utm_source: '', utm_medium: 'social' },
      },
    ];

    const groups = groupPresetsByPlatform(presets);

    expect(groups).toHaveLength(0);
  });
});
