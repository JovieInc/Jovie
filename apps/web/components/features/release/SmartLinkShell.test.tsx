import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SmartLinkShell } from './SmartLinkShell';

vi.mock('next/image', () => ({
  default: (props: { readonly alt: string; readonly className?: string }) => (
    <img alt={props.alt} className={props.className} />
  ),
}));

describe('SmartLinkShell', () => {
  it('expands the back and menu hit areas while preserving navigation and menu activation', async () => {
    const user = userEvent.setup();
    const onMenuOpen = vi.fn();
    render(
      <SmartLinkShell
        artworkUrl={null}
        returnHref='/testartist'
        onMenuOpen={onMenuOpen}
      >
        Listen
      </SmartLinkShell>
    );

    const back = screen.getByRole('link', { name: 'Back' });
    const menu = screen.getByRole('button', { name: 'Menu' });
    for (const control of [back, menu]) {
      expect(control).toHaveClass(
        'relative',
        'h-8',
        'w-8',
        'before:absolute',
        'before:h-11',
        'before:w-11',
        'before:left-1/2',
        'before:top-1/2',
        'before:-translate-x-1/2',
        'before:-translate-y-1/2'
      );
    }
    expect(back).toHaveAttribute('href', '/testartist');
    expect(menu).toHaveAttribute('aria-haspopup', 'dialog');
    await user.click(menu);
    expect(onMenuOpen).toHaveBeenCalledOnce();
  });

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
