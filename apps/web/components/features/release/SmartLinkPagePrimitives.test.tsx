import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  SmartLinkArtworkCard,
  SmartLinkPoweredByFooter,
} from './SmartLinkPagePrimitives';

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

  it('uses the banned-icon-safe AudioLines glyph without artwork', () => {
    const { container } = render(
      <SmartLinkArtworkCard title='Never Say A Word' artworkUrl={null} />
    );

    const icon = container.querySelector('svg.lucide-audio-lines');
    expect(icon).toBeTruthy();
    expect(container.querySelector('svg.lucide-disc-3')).toBeNull();
  });
});

describe('SmartLinkPoweredByFooter', () => {
  it('links to the abuse report flow for smart links', () => {
    render(<SmartLinkPoweredByFooter />);

    expect(screen.getByRole('link', { name: 'Report' })).toHaveAttribute(
      'href',
      '/report?type=smart_link'
    );
    expect(screen.getByRole('link', { name: /Powered by/i })).toHaveAttribute(
      'href',
      '/'
    );
  });

  it('honours a custom report href', () => {
    render(
      <SmartLinkPoweredByFooter reportHref='/report?type=smart_link&target=abc' />
    );

    expect(screen.getByRole('link', { name: 'Report' })).toHaveAttribute(
      'href',
      '/report?type=smart_link&target=abc'
    );
  });
});
