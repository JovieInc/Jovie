import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { LegacySocialLink } from '@/types/db';
import { ProfileIdentityHeader } from './ProfileIdentityHeader';

function social(platform: string, url: string): LegacySocialLink {
  return {
    id: platform,
    artist_id: 'artist-1',
    platform,
    url,
    clicks: 0,
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

function renderHeader(
  overrides: Partial<React.ComponentProps<typeof ProfileIdentityHeader>> = {}
) {
  return render(
    <ProfileIdentityHeader
      name='Tim White'
      handle='tim'
      imageUrl='https://example.com/tim.jpg'
      profileHref='/tim'
      listenHref='/tim/listen'
      headingTestId='profile-header'
      {...overrides}
    />
  );
}

describe('ProfileIdentityHeader', () => {
  it('renders the portrait, name heading, and jov.ie handle', () => {
    renderHeader();

    const header = screen.getByTestId('profile-identity-header');
    const heading = screen.getByRole('heading', {
      level: 1,
      name: 'Tim White',
    });
    expect(heading).toHaveAttribute('data-testid', 'profile-header');
    expect(within(heading).getByRole('link')).toHaveAttribute('href', '/tim');
    expect(screen.getByTestId('profile-identity-handle')).toHaveTextContent(
      'jov.ie/tim'
    );
    const portrait = header.querySelector('img');
    expect(portrait?.getAttribute('alt') ?? '').toBe('');
    expect(portrait?.closest('.h-20.w-20')).not.toBeNull();
  });

  it('shows the verified state as a glyph with a tooltip, never the word', () => {
    renderHeader({ isVerified: true });

    const glyph = screen.getByRole('img', { name: 'Verified Jovie Profile' });
    expect(glyph).toHaveAttribute('title', 'Verified Jovie Profile');
    expect(screen.getByTestId('profile-identity-header')).not.toHaveTextContent(
      /verified/i
    );
  });

  it('hides the verified glyph for unverified profiles', () => {
    renderHeader({ isVerified: false });
    expect(screen.queryByTestId('profile-identity-verified')).toBeNull();
  });

  it('renders the Listen action as flat frosted glass with a 44px hit area', () => {
    const onListenClick = vi.fn(event => event.preventDefault());
    renderHeader({ onListenClick });

    const listen = screen.getByRole('link', { name: 'Listen' });
    expect(listen).toHaveAttribute('href', '/tim/listen');
    expect(listen).toHaveClass('h-11');
    expect(listen).not.toHaveAttribute('aria-current');
    expect(listen.firstElementChild).toHaveClass(
      'profile-glass-pill',
      'profile-glass-pill--flat',
      'h-7',
      'font-medium'
    );
    fireEvent.click(listen);
    expect(onListenClick).toHaveBeenCalledTimes(1);
  });

  it('marks Listen as the current page while Music is open', () => {
    renderHeader({ isListenActive: true });
    expect(screen.getByRole('link', { name: 'Listen' })).toHaveAttribute(
      'aria-current',
      'page'
    );
  });

  describe('with fan updates enabled', () => {
    it('makes Get Updates the only primary action, with no Listen', () => {
      const onGetUpdatesClick = vi.fn();
      renderHeader({ onGetUpdatesClick });

      const primary = screen.getByRole('button', { name: 'Get Updates' });
      expect(primary).toHaveClass('h-11', 'flex-1');
      expect(primary.firstElementChild).toHaveClass(
        'profile-glass-pill',
        'profile-glass-pill--flat',
        'h-7'
      );
      expect(screen.queryByTestId('profile-identity-listen')).toBeNull();

      fireEvent.click(primary);
      expect(onGetUpdatesClick).toHaveBeenCalledTimes(1);
    });

    it('reads Updates On when the viewer already gets updates, same geometry', () => {
      const { rerender } = renderHeader({ onGetUpdatesClick: vi.fn() });
      const before = screen.getByTestId('profile-identity-get-updates');
      const beforeClass = before.className;

      rerender(
        <ProfileIdentityHeader
          name='Tim White'
          handle='tim'
          imageUrl='https://example.com/tim.jpg'
          profileHref='/tim'
          listenHref='/tim/listen'
          onGetUpdatesClick={vi.fn()}
          isSubscribed
        />
      );
      const after = screen.getByTestId('profile-identity-get-updates');
      expect(after).toHaveAccessibleName('Updates On');
      expect(after).toHaveAttribute('data-subscribed', 'true');
      expect(after.className).toBe(beforeClass);
    });

    it('keeps Get Updates and its row height when there is nowhere to listen', () => {
      renderHeader({
        onGetUpdatesClick: vi.fn(),
        hasListenDestination: false,
      });
      expect(
        screen.getByRole('button', { name: 'Get Updates' })
      ).toBeInTheDocument();
      expect(screen.queryByTestId('profile-identity-listen')).toBeNull();
      expect(screen.getByTestId('profile-identity-actions')).toHaveClass(
        'min-h-11'
      );
    });
  });

  it('keeps Listen primary and hides it without destinations when fans cannot subscribe', () => {
    const { unmount } = renderHeader();
    expect(screen.queryByTestId('profile-identity-get-updates')).toBeNull();
    expect(screen.getByRole('link', { name: 'Listen' })).toHaveClass('flex-1');
    unmount();

    renderHeader({ hasListenDestination: false });
    expect(screen.queryByTestId('profile-identity-listen')).toBeNull();
  });

  it('renders safe social links with brand labels and reports clicks', () => {
    const onSocialClick = vi.fn();
    renderHeader({
      onSocialClick,
      socialLinks: [
        social('instagram', 'https://instagram.com/tim'),
        social('tiktok', 'https://www.tiktok.com/@tim'),
        social('twitter', 'javascript:alert(1)'),
      ],
    });

    const row = screen.getByTestId('profile-identity-social-row');
    const links = within(row).getAllByRole('link');
    expect(links).toHaveLength(2);
    const tiktok = within(row).getByRole('link', {
      name: 'Follow Tim White on TikTok',
    });
    expect(tiktok).toHaveClass('h-11', 'w-11');
    expect(tiktok).toHaveAttribute('rel', 'noopener noreferrer');
    fireEvent.click(tiktok);
    expect(onSocialClick).toHaveBeenCalledWith(
      expect.objectContaining({ platform: 'tiktok' })
    );
  });

  it('omits the social row when there are no links and supports a p heading', () => {
    renderHeader({ headingAs: 'p', socialLinks: [] });

    expect(screen.queryByTestId('profile-identity-social-row')).toBeNull();
    expect(screen.queryByRole('heading')).toBeNull();
  });
});
