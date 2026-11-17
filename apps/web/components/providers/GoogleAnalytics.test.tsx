import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GoogleAnalytics } from './GoogleAnalytics';

type AnalyticsWindow = Window & {
  dataLayer?: unknown[][];
  gtag?: ReturnType<typeof vi.fn>;
};

const mockPublicEnv = vi.hoisted(() => ({
  NEXT_PUBLIC_GA_MEASUREMENT_ID: 'G-TMY7Z8HK47' as string | undefined,
}));
const navigation = vi.hoisted(() => ({ pathname: '/' }));
vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
}));

vi.mock('next/script', () => ({
  default: ({
    children,
    id,
    src,
  }: {
    readonly children?: React.ReactNode;
    readonly id?: string;
    readonly src?: string;
  }) => (
    <div data-testid={id} data-src={src}>
      {children}
    </div>
  ),
}));

vi.mock('@/lib/env-client', () => ({
  env: {
    IS_E2E: false,
    IS_TEST: false,
  },
}));

vi.mock('@/lib/env-public', () => ({
  publicEnv: mockPublicEnv,
}));

vi.mock('@/lib/demo-recording', () => ({
  isDemoRecordingClient: () => false,
}));

describe('GoogleAnalytics', () => {
  beforeEach(() => {
    navigation.pathname = '/';
    mockPublicEnv.NEXT_PUBLIC_GA_MEASUREMENT_ID = 'G-TMY7Z8HK47';
    (window as AnalyticsWindow).dataLayer = undefined;
    (window as AnalyticsWindow).gtag = vi.fn();
  });

  it('never loads or configures GA on a tip checkout return', () => {
    navigation.pathname = '/artist/tip/thank-you';
    const { queryByTestId, rerender } = render(<GoogleAnalytics />);
    expect(queryByTestId('ga-gtag-loader')).not.toBeInTheDocument();
    expect((window as AnalyticsWindow).gtag).not.toHaveBeenCalled();

    navigation.pathname = '/artist';
    rerender(<GoogleAnalytics />);
    expect(queryByTestId('ga-gtag-loader')).toBeInTheDocument();
  });

  it('configures GA from the client bundle instead of rendering inline script children', () => {
    const { queryByTestId, getByTestId } = render(<GoogleAnalytics />);

    expect(getByTestId('ga-gtag-loader')).toHaveAttribute(
      'data-src',
      'https://www.googletagmanager.com/gtag/js?id=G-TMY7Z8HK47'
    );
    expect(queryByTestId('ga-config')).not.toBeInTheDocument();
    expect((window as AnalyticsWindow).gtag).toHaveBeenCalledWith(
      'js',
      expect.any(Date)
    );
    expect((window as AnalyticsWindow).gtag).toHaveBeenCalledWith(
      'config',
      'G-TMY7Z8HK47'
    );
  });

  it('queues GA configuration in dataLayer when gtag is not loaded yet', () => {
    (window as AnalyticsWindow).gtag = undefined;

    const { getByTestId } = render(<GoogleAnalytics />);

    expect(getByTestId('ga-gtag-loader')).toHaveAttribute(
      'data-src',
      'https://www.googletagmanager.com/gtag/js?id=G-TMY7Z8HK47'
    );
    expect((window as AnalyticsWindow).dataLayer?.[0]?.[0]).toBe('js');
    expect((window as AnalyticsWindow).dataLayer?.[0]?.[1]).toBeInstanceOf(
      Date
    );
    expect((window as AnalyticsWindow).dataLayer?.[1]).toEqual([
      'config',
      'G-TMY7Z8HK47',
    ]);
  });

  it('skips rendering and configuration when the GA measurement ID is missing', () => {
    mockPublicEnv.NEXT_PUBLIC_GA_MEASUREMENT_ID = undefined;

    const { queryByTestId } = render(<GoogleAnalytics />);

    expect(queryByTestId('ga-gtag-loader')).not.toBeInTheDocument();
    expect(queryByTestId('ga-config')).not.toBeInTheDocument();
    expect((window as AnalyticsWindow).gtag).not.toHaveBeenCalled();
  });
});
