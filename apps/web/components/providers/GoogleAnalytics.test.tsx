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
    mockPublicEnv.NEXT_PUBLIC_GA_MEASUREMENT_ID = 'G-TMY7Z8HK47';
    (window as AnalyticsWindow).dataLayer = undefined;
    (window as AnalyticsWindow).gtag = vi.fn();
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
