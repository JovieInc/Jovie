import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SmartLinkArtworkCard } from './SmartLinkPagePrimitives';

vi.mock('next/image', () => ({
  default: (props: { readonly alt: string; readonly className?: string }) => (
    <img alt={props.alt} className={props.className} />
  ),
}));

describe('SmartLinkArtworkCard', () => {
  it('preserves complete artwork with contain fit', () => {
    render(
      <SmartLinkArtworkCard title='Never Say A Word' artworkUrl='/art.jpg' />
    );
    const image = screen.getByRole('img', { name: 'Never Say A Word artwork' });
    expect(image).toHaveClass('object-contain');
    expect(image).not.toHaveClass('object-cover');
  });
});
