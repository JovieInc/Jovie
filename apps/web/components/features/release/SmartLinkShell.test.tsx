import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SmartLinkShell } from './SmartLinkShell';

vi.mock('next/image', () => ({
  default: (props: { readonly alt: string; readonly className?: string }) => (
    <img alt={props.alt} className={props.className} />
  ),
}));

describe('SmartLinkShell', () => {
  it('fits hero artwork with contain instead of cropping it', () => {
    render(
      <SmartLinkShell
        artworkUrl='/art.jpg'
        artworkAlt='Never Say A Word artwork'
        showMenuButton={false}
      >
        Listen
      </SmartLinkShell>
    );
    const image = screen.getByRole('img', { name: 'Never Say A Word artwork' });
    expect(image).toHaveClass('object-contain');
    expect(image).not.toHaveClass('object-cover');
  });

  it('never renders text inside the art bounds in the below treatment (no text on text)', () => {
    const { container } = render(
      <SmartLinkShell
        artworkUrl='/art.jpg'
        artworkAlt='Never Say A Word artwork'
        showMenuButton={false}
        heroMeta={<h1>Never Say A Word</h1>}
      >
        Listen
      </SmartLinkShell>
    );
    const art = screen.getByTestId('smart-link-artwork');
    expect(art.textContent).toBe('');
    expect(art).not.toContainElement(
      screen.getByRole('heading', { level: 1, name: 'Never Say A Word' })
    );
    // No gradient or scrim may sit over square art either.
    expect(
      container.querySelector('[class*="bg-[linear-gradient"]')
    ).toBeNull();
  });

  it('uses the banned-icon-safe AudioLines glyph without artwork', () => {
    const { container } = render(
      <SmartLinkShell artworkUrl={null} showMenuButton={false}>
        Listen
      </SmartLinkShell>
    );

    const icon = container.querySelector('svg.lucide-audio-lines');
    expect(icon).toBeTruthy();
    expect(container.querySelector('svg.lucide-disc-3')).toBeNull();
  });
});
