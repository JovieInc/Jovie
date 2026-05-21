import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OnboardingTurnstile } from '@/components/features/onboarding/OnboardingTurnstile';

type TurnstileOptions = Parameters<
  NonNullable<Window['turnstile']>['render']
>[1];

vi.mock('next/script', () => ({
  default: ({
    onLoad,
    src,
  }: {
    readonly onLoad?: () => void;
    readonly src: string;
  }) => {
    queueMicrotask(() => onLoad?.());
    return <div data-testid='next-script' data-src={src} />;
  },
}));

describe('OnboardingTurnstile', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    delete window.turnstile;
  });

  it('surfaces a deterministic config error when the production site key is missing', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', '');
    const onToken = vi.fn();
    const onStateChange = vi.fn();

    render(
      <OnboardingTurnstile onToken={onToken} onStateChange={onStateChange} />
    );

    await waitFor(() => {
      expect(onStateChange).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'unconfigured' })
      );
    });
    expect(screen.getByTestId('onboarding-turnstile-panel')).toHaveAttribute(
      'data-turnstile-status',
      'unconfigured'
    );
    expect(onToken).not.toHaveBeenCalled();
  });

  it('renders the Cloudflare widget and returns a token when configured', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'site-key');
    const onToken = vi.fn();
    const onStateChange = vi.fn();
    const renderMock = vi.fn(
      (_target: HTMLElement, _options: TurnstileOptions) => 'widget-1'
    );
    window.turnstile = {
      render: renderMock,
      reset: vi.fn(),
      remove: vi.fn(),
    };

    render(
      <OnboardingTurnstile onToken={onToken} onStateChange={onStateChange} />
    );

    await waitFor(() => {
      expect(renderMock).toHaveBeenCalledWith(
        expect.any(HTMLElement),
        expect.objectContaining({
          sitekey: 'site-key',
          appearance: 'interaction-only',
          size: 'flexible',
        })
      );
    });
    act(() => {
      renderMock.mock.calls[0]?.[1].callback('turnstile-token');
    });
    expect(onToken).toHaveBeenCalledWith('turnstile-token');
    expect(onStateChange).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'verified' })
    );
    expect(screen.getByTestId('onboarding-turnstile-panel')).not.toBeVisible();
  });

  it('reports interactive, error, timeout, and unsupported callback states', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'site-key');
    const onToken = vi.fn();
    const onStateChange = vi.fn();
    const renderMock = vi.fn(
      (_target: HTMLElement, _options: TurnstileOptions) => 'widget-1'
    );
    window.turnstile = {
      render: renderMock,
      reset: vi.fn(),
      remove: vi.fn(),
    };

    render(
      <OnboardingTurnstile onToken={onToken} onStateChange={onStateChange} />
    );

    await waitFor(() => expect(renderMock).toHaveBeenCalled());
    const options = renderMock.mock.calls[0]?.[1];

    act(() => options?.['before-interactive-callback']?.());
    expect(screen.getByTestId('onboarding-turnstile-panel')).toHaveAttribute(
      'data-turnstile-status',
      'interactive'
    );
    expect(
      screen.getByText('Complete the Cloudflare check to send your message.')
    ).toBeVisible();

    act(() => options?.['error-callback']?.('bad-token'));
    expect(screen.getByTestId('onboarding-turnstile-panel')).toHaveAttribute(
      'data-turnstile-status',
      'error'
    );
    expect(screen.getByText('Retry verification')).toBeVisible();

    act(() => options?.['timeout-callback']?.());
    expect(screen.getByTestId('onboarding-turnstile-panel')).toHaveAttribute(
      'data-turnstile-status',
      'timeout'
    );

    act(() => options?.['unsupported-callback']?.());
    expect(screen.getByTestId('onboarding-turnstile-panel')).toHaveAttribute(
      'data-turnstile-status',
      'unsupported'
    );
    expect(onToken).not.toHaveBeenCalled();
  });

  it('resets expired and externally rejected widgets for a fresh token', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'site-key');
    const onToken = vi.fn();
    const onStateChange = vi.fn();
    const resetMock = vi.fn();
    const renderMock = vi.fn(
      (_target: HTMLElement, _options: TurnstileOptions) => 'widget-1'
    );
    window.turnstile = {
      render: renderMock,
      reset: resetMock,
      remove: vi.fn(),
    };

    const { rerender } = render(
      <OnboardingTurnstile
        onToken={onToken}
        onStateChange={onStateChange}
        resetSignal={0}
      />
    );

    await waitFor(() => expect(renderMock).toHaveBeenCalled());
    const options = renderMock.mock.calls[0]?.[1];

    act(() => options?.['expired-callback']?.());
    expect(onStateChange).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'expired' })
    );
    expect(resetMock).toHaveBeenCalledWith('widget-1');

    rerender(
      <OnboardingTurnstile
        onToken={onToken}
        onStateChange={onStateChange}
        resetSignal={1}
      />
    );
    expect(resetMock).toHaveBeenCalledTimes(2);
  });
});
