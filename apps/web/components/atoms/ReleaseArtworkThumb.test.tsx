import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ReleaseArtworkThumb } from './ReleaseArtworkThumb';

describe('ReleaseArtworkThumb', () => {
  it('renders the real artwork image when a src is provided', () => {
    render(
      <ReleaseArtworkThumb
        src='https://example.com/art.jpg'
        alt='Midnight Drive'
      />
    );

    expect(screen.getByAltText('Midnight Drive')).toBeInTheDocument();
  });

  it('falls back to the banned-icon-safe AudioLines glyph without a src', () => {
    const { container } = render(
      <ReleaseArtworkThumb src={null} alt='Midnight Drive' />
    );

    const icon = container.querySelector('[data-artwork-fallback-icon]');
    expect(icon).toHaveClass('lucide-audio-lines');
    expect(icon).not.toHaveClass('lucide-disc-3');
  });
});
