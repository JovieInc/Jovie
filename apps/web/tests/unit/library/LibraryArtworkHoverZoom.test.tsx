import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LibraryArtworkHoverZoom } from '@/app/app/(shell)/library/LibraryArtworkHoverZoom';

describe('LibraryArtworkHoverZoom', () => {
  it('renders a zoom popover on hover for fine pointers', () => {
    Object.defineProperty(globalThis, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });

    render(
      <LibraryArtworkHoverZoom
        imageUrl='https://cdn.example.com/hoodie.png'
        title='Never Say A Word Hoodie'
      >
        <div data-testid='artwork-child'>Artwork</div>
      </LibraryArtworkHoverZoom>
    );

    const surface = screen.getByTestId('library-artwork-hover-zoom-surface');
    vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 200,
      bottom: 200,
      width: 200,
      height: 200,
      toJSON: () => ({}),
    });
    fireEvent.mouseEnter(surface, { clientX: 40, clientY: 40 });
    fireEvent.mouseMove(surface, { clientX: 60, clientY: 80 });

    expect(
      screen.getByTestId('library-artwork-hover-zoom-popover')
    ).toBeInTheDocument();
    expect(screen.getByTestId('artwork-child')).toBeInTheDocument();
  });
});
