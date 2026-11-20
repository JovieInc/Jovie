import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
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

describe('SocialIcon accessibility', () => {
  it('is hidden from assistive tech by default', async () => {
    const { container } = render(
      <p>
        <SocialIcon platform='spotify' /> Listen on Spotify
      </p>
    );
    expect(container.querySelector('svg')).toHaveAttribute(
      'aria-hidden',
      'true'
    );
    await expectNoA11yViolations(container);
  });

  it('exposes a named image when labelled, and hides the unknown fallback', async () => {
    const { container } = render(
      <ul>
        <li>
          <SocialIcon
            platform='spotify'
            aria-hidden={false}
            aria-label='Spotify'
          />
        </li>
        <li>
          <SocialIcon platform='my-band-website' /> Band website
        </li>
      </ul>
    );
    expect(screen.getByRole('img', { name: 'Spotify' })).toBeInTheDocument();
    expect(screen.getAllByRole('img')).toHaveLength(1);
    await expectNoA11yViolations(container);
  });

  it('renders brand glyphs beside right-to-left labels', async () => {
    const { container } = render(
      <ul dir='rtl'>
        <li>
          <SocialIcon platform='youtube' /> شاهد على يوتيوب
        </li>
      </ul>
    );
    expect(container.querySelector('path')?.getAttribute('d')).not.toContain(
      'M13.828 10.172'
    );
    await expectNoA11yViolations(container);
  });
});
