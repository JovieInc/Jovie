import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ArtworkThumb } from './ArtworkThumb';

describe('ArtworkThumb', () => {
  it('renders abstract fallback art while the image loads', () => {
    render(
      <ArtworkThumb src='https://x.invalid/a.jpg' title='Lost' size={40} />
    );
    expect(
      document.querySelector('[data-artwork-fallback="true"]')
    ).toBeInTheDocument();
    expect(screen.queryByText('L')).not.toBeInTheDocument();
  });

  it('uses fallback art for an empty artwork source', () => {
    const { container } = render(
      <ArtworkThumb src='' title='Echo' size={40} />
    );
    const tile = container.firstElementChild as HTMLElement;
    expect(tile).toHaveAttribute('data-artwork-state', 'fallback');
    expect(
      document.querySelector('[data-artwork-fallback="true"]')
    ).toBeInTheDocument();
  });

  it('applies the size as inline width and height', () => {
    const { container } = render(
      <ArtworkThumb src='https://x.invalid/a.jpg' title='X' size={88} />
    );
    const tile = container.firstElementChild as HTMLElement;
    expect(tile.style.width).toBe('88px');
    expect(tile.style.height).toBe('88px');
  });
});
