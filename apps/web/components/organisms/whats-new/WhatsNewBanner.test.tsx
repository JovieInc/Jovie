import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WhatsNewFeed } from '@/lib/whats-new';
import {
  loadUnseenWhatsNew,
  WHATS_NEW_LAST_SEEN_KEY,
  WhatsNewBanner,
  WhatsNewBannerView,
} from './WhatsNewBanner';

const FEED: WhatsNewFeed = {
  version: 1,
  changelogUrl: 'https://jov.ie/changelog',
  entries: [
    {
      id: '26.9.2',
      title: 'Chat is home',
      date: '2026-09-26',
      summary: 'Ask first, then open the library.',
      url: 'https://jov.ie/changelog/26.9.2',
      highlights: [],
      dogfood: [],
    },
    {
      id: '26.9.1',
      title: 'Library filters',
      date: '2026-09-20',
      summary: 'One catalog.',
      url: 'https://jov.ie/changelog/26.9.1',
      highlights: [],
      dogfood: [],
    },
  ],
};

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as Response;
}

describe('loadUnseenWhatsNew', () => {
  beforeEach(() => localStorage.clear());

  it('returns the newest entry when nothing was seen', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(FEED));
    const result = await loadUnseenWhatsNew(fetchImpl);
    expect(fetchImpl).toHaveBeenCalledWith(
      '/changelog/whats-new.json',
      expect.anything()
    );
    expect(result?.entry.id).toBe('26.9.2');
    expect(result?.href).toBe('https://jov.ie/changelog/26.9.2');
  });

  it('returns null when the newest entry was seen', async () => {
    localStorage.setItem(WHATS_NEW_LAST_SEEN_KEY, '26.9.2');
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(FEED));
    expect(await loadUnseenWhatsNew(fetchImpl)).toBeNull();
  });

  it('stays silent on network, status, and contract failures', async () => {
    expect(
      await loadUnseenWhatsNew(vi.fn().mockRejectedValue(new Error('offline')))
    ).toBeNull();
    expect(
      await loadUnseenWhatsNew(
        vi.fn().mockResolvedValue(jsonResponse(FEED, false))
      )
    ).toBeNull();
    expect(
      await loadUnseenWhatsNew(
        vi.fn().mockResolvedValue(jsonResponse({ version: 99 }))
      )
    ).toBeNull();
  });
});

describe('WhatsNewBannerView', () => {
  it('names the region and links the single unseen post', () => {
    render(
      <WhatsNewBannerView
        unseen={{
          entry: FEED.entries[0],
          unseenCount: 1,
          href: FEED.entries[0].url,
        }}
        onOpen={vi.fn()}
        onDismiss={vi.fn()}
      />
    );
    expect(
      screen.getByRole('complementary', { name: "What's New" })
    ).toBeInTheDocument();
    expect(screen.getByText('Chat is home')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: "See What's New" })
    ).toHaveAttribute('href', 'https://jov.ie/changelog/26.9.2');
  });

  it('renders in flow at dock width instead of floating over content', () => {
    render(
      <WhatsNewBannerView
        unseen={{
          entry: FEED.entries[0],
          unseenCount: 1,
          href: FEED.entries[0].url,
        }}
        onOpen={vi.fn()}
        onDismiss={vi.fn()}
      />
    );
    const banner = screen.getByTestId('whats-new-banner');
    expect(banner).toHaveClass('w-full');
    expect(banner.className).not.toMatch(/(?:^|\s)fixed(?:\s|$)/);
    expect(banner.className).not.toMatch(/(?:^|\s)z-/);
  });

  it('counts multiple unseen updates and links the changelog index', () => {
    render(
      <WhatsNewBannerView
        unseen={{
          entry: FEED.entries[0],
          unseenCount: 2,
          href: FEED.changelogUrl,
        }}
        onOpen={vi.fn()}
        onDismiss={vi.fn()}
      />
    );
    expect(screen.getByText("What's New · 2 updates")).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: "See What's New" })
    ).toHaveAttribute('href', 'https://jov.ie/changelog');
  });

  it('dismisses from the button and from Escape', () => {
    const onDismiss = vi.fn();
    render(
      <WhatsNewBannerView
        unseen={{
          entry: FEED.entries[0],
          unseenCount: 1,
          href: FEED.entries[0].url,
        }}
        onOpen={vi.fn()}
        onDismiss={onDismiss}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: "Dismiss What's New" }));
    fireEvent.keyDown(screen.getByRole('link'), { key: 'Escape' });
    expect(onDismiss).toHaveBeenCalledTimes(2);
  });

  it('leaves an Escape consumed by a child overlay alone', () => {
    const onDismiss = vi.fn();
    render(
      <WhatsNewBannerView
        unseen={{
          entry: FEED.entries[0],
          unseenCount: 1,
          href: FEED.entries[0].url,
        }}
        onOpen={vi.fn()}
        onDismiss={onDismiss}
      />
    );
    const link = screen.getByRole('link');
    link.addEventListener('keydown', event => event.preventDefault());
    fireEvent.keyDown(link, { key: 'Escape' });
    expect(onDismiss).not.toHaveBeenCalled();
  });
});

describe('WhatsNewBanner', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(FEED)));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function settle() {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1600);
    });
  }

  it('keeps compact release disclosure unseen on Escape and yields to an update', async () => {
    localStorage.clear();
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(FEED));
    const { rerender } = render(
      <WhatsNewBanner enabled compact fetchImpl={fetchImpl} />
    );
    await settle();
    const trigger = screen.getByRole('button', { name: "What's New" });
    trigger.focus();
    fireEvent.click(trigger);
    expect(
      screen.getByRole('link', { name: 'Full release notes' })
    ).toBeVisible();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    expect(trigger).toHaveFocus();
    expect(localStorage.getItem(WHATS_NEW_LAST_SEEN_KEY)).toBeNull();
    rerender(
      <WhatsNewBanner enabled compact suppressed fetchImpl={fetchImpl} />
    );
    expect(
      screen.queryByRole('button', { name: "What's New" })
    ).not.toBeInTheDocument();
  });
  it('returns focus to the surviving rail control when compact details are dismissed', async () => {
    localStorage.clear();
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(FEED));
    render(
      <>
        <button type='button' data-rail-toggle='left'>
          Collapse sidebar
        </button>
        <WhatsNewBanner enabled compact fetchImpl={fetchImpl} />
      </>
    );
    await settle();
    fireEvent.click(screen.getByRole('button', { name: "What's New" }));
    const dismiss = screen.getByRole('button', {
      name: 'Dismiss',
    });
    dismiss.focus();
    fireEvent.click(dismiss);
    expect(
      screen.getByRole('button', { name: 'Collapse sidebar' })
    ).toHaveFocus();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('renders nothing while disabled', async () => {
    render(<WhatsNewBanner enabled={false} />);
    await settle();
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.queryByTestId('whats-new-banner')).toBeNull();
  });

  it('stays silent while loading, then shows the unseen entry', async () => {
    render(<WhatsNewBanner enabled />);
    expect(screen.queryByTestId('whats-new-banner')).toBeNull();
    await settle();
    expect(screen.getByTestId('whats-new-banner')).toBeInTheDocument();
  });

  it('waits while the sidebar is collapsed to icons', async () => {
    render(<WhatsNewBanner enabled collapsed />);
    await settle();
    expect(screen.queryByTestId('whats-new-banner')).toBeNull();
  });

  it('records the entry as seen on dismiss and stays hidden', async () => {
    const { unmount } = render(<WhatsNewBanner enabled />);
    await settle();
    fireEvent.click(screen.getByTestId('whats-new-banner-dismiss'));
    expect(localStorage.getItem(WHATS_NEW_LAST_SEEN_KEY)).toBe('26.9.2');
    expect(screen.queryByTestId('whats-new-banner')).toBeNull();
    unmount();

    render(<WhatsNewBanner enabled />);
    await settle();
    expect(screen.queryByTestId('whats-new-banner')).toBeNull();
  });

  it('records the entry as seen when the link opens', async () => {
    render(<WhatsNewBanner enabled />);
    await settle();
    fireEvent.click(screen.getByTestId('whats-new-banner-link'));
    expect(localStorage.getItem(WHATS_NEW_LAST_SEEN_KEY)).toBe('26.9.2');
    await settle();
    expect(screen.queryByTestId('whats-new-banner')).toBeNull();
  });

  it('shows nothing when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    render(<WhatsNewBanner enabled />);
    await settle();
    expect(screen.queryByTestId('whats-new-banner')).toBeNull();
  });

  it('returns keyboard focus to the existing sidebar control on dismissal', async () => {
    render(
      <>
        <button type='button' data-rail-toggle='left'>
          Sidebar
        </button>
        <WhatsNewBanner enabled />
      </>
    );
    await settle();
    const link = screen.getByTestId('whats-new-banner-link');
    act(() => link.focus());
    fireEvent.keyDown(link, { key: 'Escape' });
    expect(screen.queryByTestId('whats-new-banner')).toBeNull();
    expect(screen.getByRole('button', { name: 'Sidebar' })).toHaveFocus();
  });

  it('does not steal editor focus when a pointer dismisses the banner', async () => {
    render(
      <>
        <input aria-label='Draft' />
        <WhatsNewBanner enabled />
      </>
    );
    await settle();
    const draft = screen.getByRole('textbox', { name: 'Draft' });
    act(() => draft.focus());
    fireEvent.click(screen.getByTestId('whats-new-banner-dismiss'));
    expect(draft).toHaveFocus();
  });

  it('does not replay stale content when disabled and enabled again', async () => {
    const { rerender } = render(<WhatsNewBanner enabled />);
    await settle();
    expect(screen.getByTestId('whats-new-banner')).toBeInTheDocument();
    rerender(<WhatsNewBanner enabled={false} />);
    rerender(<WhatsNewBanner enabled />);
    expect(screen.queryByTestId('whats-new-banner')).toBeNull();
  });

  it('prefers the daily post and dismisses it server-side', async () => {
    const prompt = {
      contractVersion: 'release-communications/v1',
      postId: 'post-9',
      localDate: '2026-10-02',
      title: 'Daily shipped outcome',
      summary: 'New today',
      materialCount: 1,
      changelogUrl: 'https://jov.ie/changelog',
    };
    const fetchMock = vi
      .fn()
      .mockImplementation((url: string) =>
        Promise.resolve(
          jsonResponse(url === '/api/whats-new' ? { prompt } : FEED)
        )
      );
    vi.stubGlobal('fetch', fetchMock);

    render(<WhatsNewBanner enabled />);
    await settle();
    expect(screen.getByText('Daily shipped outcome')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('whats-new-banner-dismiss'));
    expect(screen.queryByTestId('whats-new-banner')).toBeNull();
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          url === '/api/whats-new/dismiss' &&
          (init as RequestInit).method === 'POST' &&
          String((init as RequestInit).body).includes('post-9')
      )
    ).toBe(true);
    // Daily dismissal is server-side; the feed last-seen key stays empty.
    expect(localStorage.getItem(WHATS_NEW_LAST_SEEN_KEY)).toBeNull();
  });
});
