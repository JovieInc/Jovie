import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { SmartLinkArtwork } from './SmartLinkArtwork';

vi.mock('@/features/release/AlbumArtworkContextMenu', () => ({
  AlbumArtworkContextMenu: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  buildArtworkSizes: () => ({}),
}));

vi.mock('next/image', () => ({
  default: (props: { readonly alt: string; readonly className?: string }) => (
    <img alt={props.alt} className={props.className} />
  ),
}));

describe('SmartLinkArtwork', () => {
  it('preserves complete artwork with contain fit', () => {
    render(<SmartLinkArtwork src='/art.jpg' alt='Never Say A Word artwork' />);
    const image = screen.getByRole('img', { name: 'Never Say A Word artwork' });
    expect(image).toHaveClass('object-contain');
    expect(image).not.toHaveClass('object-cover');
    expect(image.closest('[data-artwork-frame="hero"]')).toBeInTheDocument();
  });

  it('uses the banned-icon-safe AudioLines glyph without a src', () => {
    const { container } = render(
      <SmartLinkArtwork src={null} alt='Never Say A Word artwork' />
    );

    const icon = container.querySelector('svg.lucide-audio-lines');
    expect(icon).toBeTruthy();
    expect(container.querySelector('svg.lucide-disc-3')).toBeNull();
  });
});
