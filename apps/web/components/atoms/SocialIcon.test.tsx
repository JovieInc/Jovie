import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  getPlatformIcon,
  getPlatformIconMetadata,
  SocialIcon,
} from './SocialIcon';

describe('SocialIcon', () => {
  it('renders the brand path for a known platform', () => {
    const { container } = render(<SocialIcon platform='instagram' />);
    const path = container.querySelector('path');
    expect(path?.getAttribute('d')).toContain('M7.0301.084');
  });

  it('normalizes spaced and underscored platform ids to the same icon', () => {
    const { container: dashed } = render(<SocialIcon platform='apple-music' />);
    const { container: underscored } = render(
      <SocialIcon platform='apple_music' />
    );
    expect(dashed.querySelector('path')?.getAttribute('d')).toBe(
      underscored.querySelector('path')?.getAttribute('d')
    );
  });

  it('renders the link fallback for an unknown platform', () => {
    const { container } = render(<SocialIcon platform='not-a-network' />);
    expect(container.querySelector('path')?.getAttribute('d')).toContain(
      'M13.828 10.172'
    );
  });

  it('applies size and aria attributes', () => {
    const { container } = render(
      <SocialIcon
        platform='spotify'
        size={20}
        aria-hidden={false}
        aria-label='Spotify'
      />
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('role')).toBe('img');
    expect(svg?.getAttribute('aria-label')).toBe('Spotify');
    expect(svg?.style.width).toBe('20px');
  });
});

describe('platform icon helpers', () => {
  it('returns brand hex metadata synchronously', () => {
    expect(getPlatformIconMetadata('Instagram')?.hex).toBe('E4405F');
    expect(getPlatformIconMetadata('unknown-xyz')).toBeUndefined();
  });

  it('resolves path, hex, and normalized slug', async () => {
    await expect(getPlatformIcon('YouTube Music')).resolves.toMatchObject({
      slug: 'youtubemusic',
      hex: 'FF0000',
    });
    await expect(getPlatformIcon('unknown-xyz')).resolves.toBeUndefined();
  });
});
