import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  OPEN_IN_APP_DISMISSAL_STORAGE_KEY,
  OPEN_IN_APP_TIMEOUT_MS,
} from '@/lib/mobile/open-in-app';
import { OpenInAppBanner } from './OpenInAppBanner';

const IPHONE_SAFARI_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPHONE_WKWEBVIEW_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';

const mockPathname = vi.hoisted(() => vi.fn(() => '/app/chat'));

vi.mock('next/navigation', () => ({
  usePathname: mockPathname,
}));

function setUserAgent(ua: string) {
  Object.defineProperty(globalThis.navigator, 'userAgent', {
    configurable: true,
    value: ua,
  });
}

const assignSpy = vi.hoisted(() => vi.fn());

beforeEach(() => {
  mockPathname.mockReturnValue('/app/chat');
  setUserAgent(IPHONE_SAFARI_UA);
  localStorage.clear();
  assignSpy.mockClear();
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    writable: true,
    value: { ...globalThis.location, assign: assignSpy },
  });
  Object.defineProperty(globalThis, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('OpenInAppBanner', () => {
  it('renders the banner on an eligible mobile-web /app route', () => {
    render(<OpenInAppBanner />);
    expect(screen.getByTestId('open-in-app-banner')).toHaveAttribute(
      'data-state',
      'ready'
    );
    expect(screen.getByText('Open in Jovie')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument();
  });

  it('fires the verified ie.jov.jovie:// deep link on Open', () => {
    render(<OpenInAppBanner />);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(assignSpy).toHaveBeenCalledWith('ie.jov.jovie://start');
  });

  it('targets the settings deep link from /app/settings', () => {
    mockPathname.mockReturnValue('/app/settings/account');
    render(<OpenInAppBanner />);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(assignSpy).toHaveBeenCalledWith('ie.jov.jovie://settings');
  });

  it('dismisses and persists the dismissal', () => {
    render(<OpenInAppBanner />);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByTestId('open-in-app-banner')).toBeNull();
    expect(
      localStorage.getItem(OPEN_IN_APP_DISMISSAL_STORAGE_KEY)
    ).not.toBeNull();
  });

  it('stays hidden when a dismissal is still inside the TTL', () => {
    localStorage.setItem(OPEN_IN_APP_DISMISSAL_STORAGE_KEY, String(Date.now()));
    render(<OpenInAppBanner />);
    expect(screen.queryByTestId('open-in-app-banner')).toBeNull();
  });

  it('never renders inside the native app webview', () => {
    setUserAgent(IPHONE_WKWEBVIEW_UA);
    render(<OpenInAppBanner />);
    expect(screen.queryByTestId('open-in-app-banner')).toBeNull();
  });

  it('never renders on desktop or on ineligible routes', () => {
    setUserAgent(DESKTOP_UA);
    const { unmount } = render(<OpenInAppBanner />);
    expect(screen.queryByTestId('open-in-app-banner')).toBeNull();
    unmount();

    setUserAgent(IPHONE_SAFARI_UA);
    mockPathname.mockReturnValue('/tim');
    render(<OpenInAppBanner />);
    expect(screen.queryByTestId('open-in-app-banner')).toBeNull();
  });

  it('stays on the page with an unavailable state when the app does not open', () => {
    vi.useFakeTimers();
    render(<OpenInAppBanner />);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(assignSpy).toHaveBeenCalledWith('ie.jov.jovie://start');

    act(() => {
      vi.advanceTimersByTime(OPEN_IN_APP_TIMEOUT_MS + 10);
    });
    const banner = screen.getByTestId('open-in-app-banner');
    expect(banner).toHaveAttribute('data-state', 'unavailable');
    expect(
      screen.getByText('The Jovie app is not installed on this device.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open' })).toBeNull();
  });
});
