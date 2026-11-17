import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RELEASE_COMMUNICATIONS_CONTRACT_VERSION } from '@/lib/release-communications';
import {
  WHATS_NEW_DAILY_DISMISS_PATH,
  WHATS_NEW_DAILY_PATH,
} from '@/lib/release-communications/prompt';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { WhatsNewBanner, WhatsNewBannerView } from './WhatsNewBanner';

const ENTRY = {
  id: '26.9.2',
  title: 'Chat is home',
  date: '2026-09-26',
  summary: 'Ask first, then open the library.',
  url: 'https://jov.ie/changelog/26.9.2',
  highlights: [],
  dogfood: [],
};

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as Response;
}

describe('WhatsNewBannerView certificate', () => {
  it('opens and dismisses through its handlers, axe-clean', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const onDismiss = vi.fn();
    const { container } = render(
      <WhatsNewBannerView
        unseen={{
          entry: ENTRY,
          unseenCount: 3,
          href: 'https://jov.ie/changelog',
        }}
        onOpen={onOpen}
        onDismiss={onDismiss}
      />
    );

    expect(
      screen.getByRole('complementary', { name: "What's New" })
    ).toHaveTextContent("What's New · 3 updates");
    await expectNoA11yViolations(container);

    const link = screen.getByRole('link', { name: "See What's New" });
    link.addEventListener('click', event => event.preventDefault());
    await user.click(link);
    expect(onOpen).toHaveBeenCalledTimes(1);

    await user.click(
      screen.getByRole('button', { name: "Dismiss What's New" })
    );
    expect(onDismiss).toHaveBeenCalledTimes(1);

    link.focus();
    await user.keyboard('{Escape}');
    expect(onDismiss).toHaveBeenCalledTimes(2);
  });

  it('stays axe-clean without a summary and in an RTL document', async () => {
    const { container } = render(
      <div dir='rtl'>
        <WhatsNewBannerView
          unseen={{
            entry: {
              ...ENTRY,
              title: 'الدردشة هي الصفحة الرئيسية',
              summary: '',
            },
            unseenCount: 1,
            href: ENTRY.url,
          }}
          onOpen={vi.fn()}
          onDismiss={vi.fn()}
        />
      </div>
    );

    expect(screen.getByText('الدردشة هي الصفحة الرئيسية')).toBeInTheDocument();
    expect(screen.getByText("What's New")).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});

describe('WhatsNewBanner certificate', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
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

  it('stays silent while the check is still loading', async () => {
    const fetchImpl = vi.fn(() => new Promise<Response>(() => {}));
    const { container } = render(
      <WhatsNewBanner enabled fetchImpl={fetchImpl} />
    );

    await settle();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('whats-new-banner')).toBeNull();
    // axe schedules its own timers; run it on the real clock.
    vi.useRealTimers();
    await expectNoA11yViolations(container);
  });

  it.each([
    [
      'empty feed',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input) === WHATS_NEW_DAILY_PATH
          ? jsonResponse(null)
          : jsonResponse({
              version: 1,
              changelogUrl: 'https://jov.ie/changelog',
              entries: [],
            })
      ),
    ],
    ['server error', vi.fn(async () => jsonResponse(null, false))],
    ['offline', vi.fn(() => Promise.reject(new TypeError('Failed to fetch')))],
  ])('stays silent on %s', async (_name, fetchImpl) => {
    const { container } = render(
      <WhatsNewBanner enabled fetchImpl={fetchImpl as typeof fetch} />
    );

    await settle();
    expect(fetchImpl).toHaveBeenCalled();
    expect(screen.queryByTestId('whats-new-banner')).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });

  it('shows a daily post and records its dismissal server-side', async () => {
    const dismissFetch = vi.fn().mockResolvedValue(jsonResponse({}));
    vi.stubGlobal('fetch', dismissFetch);
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) =>
      String(input) === WHATS_NEW_DAILY_PATH
        ? jsonResponse({
            prompt: {
              contractVersion: RELEASE_COMMUNICATIONS_CONTRACT_VERSION,
              postId: 'post-1',
              title: 'Daily update',
              localDate: '2026-09-26',
              summary: 'Two new features.',
              changelogUrl: 'https://jov.ie/changelog',
              materialCount: 2,
            },
          })
        : jsonResponse(null)
    );
    const { container } = render(
      <WhatsNewBanner enabled fetchImpl={fetchImpl as typeof fetch} />
    );

    await settle();
    expect(screen.getByTestId('whats-new-banner')).toHaveTextContent(
      "What's New · 2 updates"
    );
    vi.useRealTimers();
    await expectNoA11yViolations(container);
    act(() => {
      screen.getByTestId('whats-new-banner-dismiss').click();
    });
    expect(screen.queryByTestId('whats-new-banner')).toBeNull();
    expect(dismissFetch).toHaveBeenCalledWith(
      WHATS_NEW_DAILY_DISMISS_PATH,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ postId: 'post-1' }),
      })
    );
  });
});
