import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  PublicSurfaceShell,
  PublicSurfaceStage,
} from '@/components/organisms/public-surface';
import { SmartLinkShell } from './SmartLinkShell';

vi.mock('next/image', () => ({
  default: (props: { readonly alt: string; readonly className?: string }) => (
    <img alt={props.alt} className={props.className} />
  ),
}));

describe('SmartLinkShell', () => {
  it('scopes full-card scrolling to smart links while shared public panels retain their height cap', () => {
    render(
      <>
        <SmartLinkShell artworkUrl={null} showMenuButton={false}>
          Smart-link service
        </SmartLinkShell>
        <PublicSurfaceShell>
          <PublicSurfaceStage>Other public content</PublicSurfaceStage>
        </PublicSurfaceShell>
      </>
    );

    const service = screen.getByText('Smart-link service');
    const otherContent = screen.getByText('Other public content');
    expect(service.closest('.profile-viewport')).toHaveClass('overflow-y-auto');
    // Scrollable regions are keyboard-reachable (scrollable-region-focusable).
    expect(service.closest('.profile-viewport')).toHaveAttribute('tabindex', '0');
    expect(service.closest('main')?.firstElementChild).toHaveClass(
      'md:max-h-none'
    );
    expect(otherContent.closest('.profile-viewport')).not.toHaveClass(
      'overflow-y-auto'
    );
    expect(otherContent.closest('main')?.firstElementChild).toHaveClass(
      'md:max-h-[min(920px,calc(100dvh-64px))]'
    );
  });

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
