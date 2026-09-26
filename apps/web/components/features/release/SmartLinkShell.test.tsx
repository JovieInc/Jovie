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
