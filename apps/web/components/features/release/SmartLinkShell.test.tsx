import { render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PublicSurfaceShell,
  PublicSurfaceStage,
} from '@/components/organisms/public-surface';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  SMART_LINK_MENU_ICON_CLASS,
  SMART_LINK_MENU_ITEM_CLASS,
  SmartLinkShell,
  useSmartLinkShare,
} from './SmartLinkShell';

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

  it('keeps the menu and brand mark on the fixed on-media white over the noir stage', () => {
    expect(SMART_LINK_MENU_ITEM_CLASS).toContain('text-on-media/88');
    expect(SMART_LINK_MENU_ITEM_CLASS).toContain('active:bg-on-media/[0.06]');
    expect(SMART_LINK_MENU_ICON_CLASS).toContain('text-on-media/40');
    render(
      <SmartLinkShell artworkUrl={null} showMenuButton={false}>
        Listen
      </SmartLinkShell>
    );
    expect(screen.getByTestId('smart-link-brand-mark')).toHaveClass(
      'text-on-media/48'
    );
  });

  it('renders the empty-artwork state without axe violations', async () => {
    const { container } = render(
      <SmartLinkShell artworkUrl={null} showMenuButton={false}>
        {null}
      </SmartLinkShell>
    );
    expect(screen.getByTestId('smart-link-artwork')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders a partial hero with only a title, then opens the menu, without axe violations', async () => {
    const user = userEvent.setup();
    const onMenuOpen = vi.fn();
    const { container } = render(
      <SmartLinkShell
        artworkUrl='/art.jpg'
        onMenuOpen={onMenuOpen}
        heroMeta={<h1>Never Say A Word</h1>}
      >
        Listen
      </SmartLinkShell>
    );
    expect(screen.queryByTestId('smart-link-back')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Menu' }));
    expect(onMenuOpen).toHaveBeenCalledOnce();
    await expectNoA11yViolations(container);
  });

  it('wraps a long title below the art without axe violations', async () => {
    const title =
      'Never Say A Word (Extended Club Mix featuring The Midnight Strings Orchestra)';
    const { container } = render(
      <SmartLinkShell
        artworkUrl='/art.jpg'
        returnHref='/tim'
        returnLabel='Back to Tim White and The Midnight Strings Orchestra'
        onMenuOpen={() => undefined}
        heroMeta={<h1>{title}</h1>}
      >
        Listen
      </SmartLinkShell>
    );
    expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    expect(screen.getByTestId('smart-link-artwork').textContent).toBe('');
    await expectNoA11yViolations(container);
  });

  it('renders in a right-to-left page without axe violations', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <SmartLinkShell
          artworkUrl='/art.jpg'
          returnHref='/tim'
          returnLabel='رجوع'
          onMenuOpen={() => undefined}
          heroMeta={<h1>لا تقل كلمة</h1>}
        >
          استمع الآن
        </SmartLinkShell>
      </div>
    );
    expect(screen.getByRole('link', { name: 'رجوع' })).toHaveAttribute(
      'href',
      '/tim'
    );
    await expectNoA11yViolations(container);
  });
});

describe('useSmartLinkShare', () => {
  const originalShare = navigator.share;
  const originalClipboard = navigator.clipboard;
  afterEach(() => {
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: originalShare,
    });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: originalClipboard,
    });
  });

  it('closes the menu and uses the native share sheet when available', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: share,
    });
    const onClose = vi.fn();
    const { result } = renderHook(() =>
      useSmartLinkShare('Never Say A Word', 'Tim White', onClose)
    );
    await result.current();
    expect(onClose).toHaveBeenCalledOnce();
    expect(share).toHaveBeenCalledWith({
      title: 'Never Say A Word — Tim White',
      url: globalThis.location.href,
    });
  });

  it('copies the link without a share sheet and swallows a failed copy (no error UI)', async () => {
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: undefined,
    });
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const { result } = renderHook(() => useSmartLinkShare('T', 'A'));
    await expect(result.current()).resolves.toBeUndefined();
    expect(writeText).toHaveBeenCalledWith(globalThis.location.href);
  });
});
