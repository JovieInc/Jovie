import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ArtworkFallbackTile } from './ArtworkFallbackTile';

describe('ArtworkFallbackTile', () => {
  it('renders the deterministic fallback surface for a seed', () => {
    const { container } = render(<ArtworkFallbackTile seed='rel_1' />);

    expect(
      container.querySelector('[data-artwork-fallback="true"]')
    ).toBeTruthy();
  });

  it('uses the banned-icon-safe AudioLines glyph, not the retired Disc3', () => {
    const { container } = render(<ArtworkFallbackTile seed='rel_1' />);

    const icon = container.querySelector('[data-artwork-fallback-icon]');
    expect(icon).toHaveClass('lucide-audio-lines');
    expect(icon).not.toHaveClass('lucide-disc-3');
  });

  it('drops the decorative sleeve and accent bar for thumbnail size', () => {
    const { container } = render(
      <ArtworkFallbackTile seed='rel_1' size='thumbnail' />
    );

    expect(
      container.querySelector('[data-artwork-fallback-sleeve]')
    ).toBeNull();
    expect(
      container.querySelector('[data-artwork-fallback-compact="true"]')
    ).toBeTruthy();
  });
});
