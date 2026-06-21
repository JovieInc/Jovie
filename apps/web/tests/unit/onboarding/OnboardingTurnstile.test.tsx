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
    delete document.documentElement.dataset.e2eMode;
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
    expect(
      screen.queryByTestId('onboarding-turnstile-panel')
    ).not.toBeInTheDocument();
  });

  it('keeps the security chrome hidden while Turnstile is still loading', async () => {
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
    expect(
      screen.queryByTestId('onboarding-turnstile-panel')
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('onboarding-turnstile-widget-frame')).toHaveClass(
      'sr-only'
    );
    expect(screen.queryByText('Security Check')).not.toBeInTheDocument();
  });

  it('bypasses verification in runtime E2E mode', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'site-key');
    document.documentElement.dataset.e2eMode = '1';
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

    expect(screen.queryByTestId('next-script')).not.toBeInTheDocument();
    await waitFor(() => {
      expect(onToken).toHaveBeenCalledWith('local-dev-turnstile-bypass');
    });
    expect(renderMock).not.toHaveBeenCalled();
    expect(onStateChange).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'bypassed' })
    );
    expect(
      screen.queryByTestId('onboarding-turnstile-panel')
    ).not.toBeInTheDocument();
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
      screen.getByText('Required before your first message.')
    ).toBeVisible();

    act(() => options?.['error-callback']?.('bad-token'));
    expect(screen.getByTestId('onboarding-turnstile-panel')).toHaveAttribute(
      'data-turnstile-status',
      'error'
    );
    expect(screen.getByText('Retry Verification')).toBeVisible();

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

  it('hides the security panel during silent loading', async () => {
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
    expect(
      screen.queryByTestId('onboarding-turnstile-panel')
    ).not.toBeInTheDocument();
    expect(
      screen.getByTestId('onboarding-turnstile-widget-frame')
    ).toBeTruthy();
  });

  it('remounts the widget when verification is reset externally', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'site-key');
    const onToken = vi.fn();
    const onStateChange = vi.fn();
    const removeMock = vi.fn();
    const renderMock = vi.fn(
      (_target: HTMLElement, _options: TurnstileOptions) => 'widget-1'
    );
    window.turnstile = {
      render: renderMock,
      reset: vi.fn(),
      remove: removeMock,
    };

    const { rerender } = render(
      <OnboardingTurnstile
        onToken={onToken}
        onStateChange={onStateChange}
        resetSignal={0}
      />
    );

    await waitFor(() => expect(renderMock).toHaveBeenCalledTimes(1));

    rerender(
      <OnboardingTurnstile
        onToken={onToken}
        onStateChange={onStateChange}
        resetSignal={1}
      />
    );

    expect(removeMock).toHaveBeenCalledWith('widget-1');
    expect(renderMock).toHaveBeenCalledTimes(2);
    expect(onStateChange).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'loading' })
    );
  });

  it('resets expired and externally rejected widgets for a fresh token', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'site-key');
    const onToken = vi.fn();
    const onStateChange = vi.fn();
    const removeMock = vi.fn();
    const renderMock = vi.fn(
      (_target: HTMLElement, _options: TurnstileOptions) => 'widget-1'
    );
    window.turnstile = {
      render: renderMock,
      reset: vi.fn(),
      remove: removeMock,
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
    expect(removeMock).not.toHaveBeenCalled();

    rerender(
      <OnboardingTurnstile
        onToken={onToken}
        onStateChange={onStateChange}
        resetSignal={1}
      />
    );
    expect(removeMock).toHaveBeenCalledWith('widget-1');
    expect(renderMock).toHaveBeenCalledTimes(2);
  });

  it('renders a state-aware security icon badge', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'site-key');
    const renderMock = vi.fn(
      (_target: HTMLElement, _options: TurnstileOptions) => 'widget-1'
    );
    window.turnstile = {
      render: renderMock,
      reset: vi.fn(),
      remove: vi.fn(),
    };

    render(<OnboardingTurnstile onToken={vi.fn()} onStateChange={vi.fn()} />);

    await waitFor(() => expect(renderMock).toHaveBeenCalled());
    const options = renderMock.mock.calls[0]?.[1];

    act(() => options?.['before-interactive-callback']?.());
    expect(screen.getByTestId('onboarding-turnstile-icon')).toHaveAttribute(
      'data-turnstile-icon',
      'interactive'
    );

    act(() => options?.['error-callback']?.('bad-token'));
    expect(screen.getByTestId('onboarding-turnstile-icon')).toHaveAttribute(
      'data-turnstile-icon',
      'error'
    );
  });

  it('shows a shimmer placeholder in the widget frame during a challenge', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'site-key');
    const renderMock = vi.fn(
      (_target: HTMLElement, _options: TurnstileOptions) => 'widget-1'
    );
    window.turnstile = {
      render: renderMock,
      reset: vi.fn(),
      remove: vi.fn(),
    };

    render(<OnboardingTurnstile onToken={vi.fn()} onStateChange={vi.fn()} />);

    await waitFor(() => expect(renderMock).toHaveBeenCalled());
    const options = renderMock.mock.calls[0]?.[1];

    // Silent loading: no challenge UI, so no shimmer.
    expect(
      screen.queryByTestId('onboarding-turnstile-widget-skeleton')
    ).not.toBeInTheDocument();

    act(() => options?.['before-interactive-callback']?.());
    expect(
      screen.getByTestId('onboarding-turnstile-widget-skeleton')
    ).toBeInTheDocument();
  });

  it('holds a brief Verified confirmation after a visible challenge, then collapses', async () => {
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

    // The user actually sees a challenge first.
    act(() => options?.['before-interactive-callback']?.());
    expect(screen.getByTestId('onboarding-turnstile-panel')).toBeVisible();

    // Success while visible holds a brief "Verified" beat.
    act(() => options?.callback('turnstile-token'));
    expect(screen.getByTestId('onboarding-turnstile-panel')).toHaveAttribute(
      'data-turnstile-status',
      'verified'
    );
    expect(screen.getByText('Verified')).toBeVisible();

    // The panel collapses once the confirmation hold elapses.
    await waitFor(() =>
      expect(
        screen.queryByTestId('onboarding-turnstile-panel')
      ).not.toBeInTheDocument()
    );
    expect(onToken).toHaveBeenCalledWith('turnstile-token');
  });

  it('collapses immediately on a silent verification (no challenge shown)', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'site-key');
    const renderMock = vi.fn(
      (_target: HTMLElement, _options: TurnstileOptions) => 'widget-1'
    );
    window.turnstile = {
      render: renderMock,
      reset: vi.fn(),
      remove: vi.fn(),
    };

    render(<OnboardingTurnstile onToken={vi.fn()} onStateChange={vi.fn()} />);

    await waitFor(() => expect(renderMock).toHaveBeenCalled());
    const options = renderMock.mock.calls[0]?.[1];

    // No before-interactive callback: token arrives silently.
    act(() => options?.callback('turnstile-token'));
    expect(
      screen.queryByTestId('onboarding-turnstile-panel')
    ).not.toBeInTheDocument();
  });
});
