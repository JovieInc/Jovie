import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ArtworkThumb } from './ArtworkThumb';

afterEach(() => {
  vi.unstubAllGlobals();
});

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
    expect(tile).toHaveClass('rounded-lg', 'border-0', 'shadow-none');
  });

  it('keeps tiny shell artwork nearly square without decoration', () => {
    const { container } = render(
      <ArtworkThumb src='' title='Tiny' size={28} />
    );
    const tile = container.firstElementChild as HTMLElement;

    expect(tile).toHaveAttribute('data-artwork-frame', 'thumbnail');
    expect(tile).toHaveClass(
      'rounded-xs',
      'border-0',
      'outline-none',
      'shadow-none'
    );
  });

  it('paints loaded artwork with contain so the square stays complete', async () => {
    vi.stubGlobal(
      'Image',
      class {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        set src(_value: string) {
          this.onload?.();
        }
      }
    );

    const { container } = render(
      <ArtworkThumb src='https://x.invalid/a.jpg' title='Lost' size={40} />
    );

    await waitFor(() => {
      expect(container.firstElementChild).toHaveAttribute(
        'data-artwork-state',
        'image'
      );
    });

    const paint = container.querySelector(
      '[data-artwork-state="image"] span'
    ) as HTMLElement;
    expect(paint).toHaveClass('bg-contain', 'bg-center', 'bg-no-repeat');
    expect(paint).not.toHaveClass('bg-cover');
  });
});
