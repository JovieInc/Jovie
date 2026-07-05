import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isOnboardingTurnstilePanelVisible,
  ONBOARDING_TURNSTILE_LOADING_STALL_MS,
  OnboardingTurnstile,
} from '@/components/features/onboarding/OnboardingTurnstile';

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

function mockTurnstile(
  renderImpl?: (target: HTMLElement, options: TurnstileOptions) => string
) {
  const remove = vi.fn();
  const reset = vi.fn();
  const render = vi.fn(
    renderImpl ?? ((_t: HTMLElement, _o: TurnstileOptions) => 'widget-1')
  );
  window.turnstile = { render, reset, remove };
  return { render, reset, remove };
}

/**
 * Minimal-presentation contract (JOV-3563): the component shows NO "Security
 * Check" panel, heading, or "Verified" beat. The only thing it ever renders is
 * the bare Cloudflare widget, and only for a genuine interactive challenge.
 * Everything else is silent and routed to OnboardingShell via onStateChange.
 */
describe('OnboardingTurnstile (minimal presentation)', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    delete document.documentElement.dataset.e2eMode;
    delete window.turnstile;
  });

  it('never renders a "Security Check" panel or heading', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'site-key');
    const { render: renderMock } = mockTurnstile();

    render(<OnboardingTurnstile onToken={vi.fn()} onStateChange={vi.fn()} />);

    await waitFor(() => expect(renderMock).toHaveBeenCalled());
    expect(screen.queryByText('Security Check')).not.toBeInTheDocument();
    expect(screen.queryByText('Retry Verification')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('onboarding-turnstile-panel')
    ).not.toBeInTheDocument();
  });

  it('verifies silently — no visible chrome on the happy path', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'site-key');
    const onToken = vi.fn();
    const onStateChange = vi.fn();
    const { render: renderMock } = mockTurnstile();

    render(
      <OnboardingTurnstile onToken={onToken} onStateChange={onStateChange} />
    );

    await waitFor(() =>
      expect(renderMock).toHaveBeenCalledWith(
        expect.any(HTMLElement),
        expect.objectContaining({ appearance: 'execute', size: 'flexible' })
      )
    );

    // The widget frame exists for the token machinery but stays off-screen.
    expect(
      screen.getByTestId('onboarding-turnstile-widget-frame')
    ).toHaveAttribute('data-turnstile-mount', 'silent');

    act(() => renderMock.mock.calls[0]?.[1].callback('turnstile-token'));
    expect(onToken).toHaveBeenCalledWith('turnstile-token');
    expect(onStateChange).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'verified' })
    );
    // Still off-screen after a silent verification — no flash.
    expect(
      screen.getByTestId('onboarding-turnstile-widget-frame')
    ).toHaveAttribute('data-turnstile-mount', 'silent');
  });

  it('reveals the bare widget only for a genuine interactive challenge', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'site-key');
    const onToken = vi.fn();
    const onStateChange = vi.fn();
    const { render: renderMock } = mockTurnstile(target => {
      target.append(document.createElement('div'));
      return 'widget-1';
    });

    render(
      <OnboardingTurnstile onToken={onToken} onStateChange={onStateChange} />
    );

    await waitFor(() => expect(renderMock).toHaveBeenCalled());
    const options = renderMock.mock.calls[0]?.[1];
    const frame = screen.getByTestId('onboarding-turnstile-widget-frame');
    const widgetTarget = document.querySelector('[id^="cf-turnstile-"]');

    expect(frame).toHaveAttribute('data-turnstile-mount', 'silent');
    expect(widgetTarget?.className).toContain('[&>div]:invisible');

    act(() => options?.['before-interactive-callback']?.());
    expect(
      screen.getByTestId('onboarding-turnstile-widget-frame')
    ).toHaveAttribute('data-turnstile-status', 'interactive');
    expect(
      screen.getByTestId('onboarding-turnstile-widget-frame')
    ).not.toHaveClass('sr-only');

    await waitFor(() =>
      expect(widgetTarget?.className).toContain('[&>div]:visible')
    );

    act(() => options?.callback('turnstile-token'));
    expect(onToken).toHaveBeenCalledWith('turnstile-token');
    expect(onStateChange).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'verified' })
    );
    expect(
      screen.getByTestId('onboarding-turnstile-widget-frame')
    ).toHaveAttribute('data-turnstile-mount', 'silent');
  });

  it('routes hard failures to onStateChange without a visible panel', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'site-key');
    const onStateChange = vi.fn();
    const { render: renderMock } = mockTurnstile();

    render(
      <OnboardingTurnstile onToken={vi.fn()} onStateChange={onStateChange} />
    );

    await waitFor(() => expect(renderMock).toHaveBeenCalled());
    const options = renderMock.mock.calls[0]?.[1];

    act(() => options?.['error-callback']?.('bad-token'));
    expect(onStateChange).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'error' })
    );
    expect(
      screen.getByTestId('onboarding-turnstile-widget-frame')
    ).toHaveAttribute('data-turnstile-mount', 'silent');
    expect(screen.queryByText('Security Check')).not.toBeInTheDocument();

    act(() => options?.['unsupported-callback']?.());
    expect(onStateChange).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'unsupported' })
    );
  });

  it('silently re-issues a token on expiry (never re-walls an in-progress chat)', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'site-key');
    const onStateChange = vi.fn();
    const { render: renderMock, remove: removeMock } = mockTurnstile();

    render(
      <OnboardingTurnstile onToken={vi.fn()} onStateChange={onStateChange} />
    );

    await waitFor(() => expect(renderMock).toHaveBeenCalledTimes(1));
    const options = renderMock.mock.calls[0]?.[1];

    act(() => options?.['expired-callback']?.());
    expect(onStateChange).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'expired' })
    );
    // Auto-reset re-mounts the widget for a fresh silent token.
    await waitFor(() => expect(removeMock).toHaveBeenCalledWith('widget-1'));
    await waitFor(() => expect(renderMock).toHaveBeenCalledTimes(2));
  });

  it('reports unconfigured and renders nothing when the site key is missing', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', '');
    const onToken = vi.fn();
    const onStateChange = vi.fn();

    render(
      <OnboardingTurnstile onToken={onToken} onStateChange={onStateChange} />
    );

    await waitFor(() =>
      expect(onStateChange).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'unconfigured' })
      )
    );
    expect(
      screen.queryByTestId('onboarding-turnstile-widget-frame')
    ).not.toBeInTheDocument();
    expect(onToken).not.toHaveBeenCalled();
  });

  it('bypasses verification in runtime E2E mode (no script, no UI)', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'site-key');
    document.documentElement.dataset.e2eMode = '1';
    const onToken = vi.fn();
    const onStateChange = vi.fn();
    const { render: renderMock } = mockTurnstile();

    render(
      <OnboardingTurnstile onToken={onToken} onStateChange={onStateChange} />
    );

    expect(screen.queryByTestId('next-script')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(onToken).toHaveBeenCalledWith('local-dev-turnstile-bypass')
    );
    expect(renderMock).not.toHaveBeenCalled();
    expect(onStateChange).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'bypassed' })
    );
    expect(
      screen.queryByTestId('onboarding-turnstile-widget-frame')
    ).not.toBeInTheDocument();
  });

  it('remounts the widget when verification is reset externally', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'site-key');
    const onStateChange = vi.fn();
    const { render: renderMock, remove: removeMock } = mockTurnstile();

    const { rerender } = render(
      <OnboardingTurnstile
        onToken={vi.fn()}
        onStateChange={onStateChange}
        resetSignal={0}
      />
    );

    await waitFor(() => expect(renderMock).toHaveBeenCalledTimes(1));

    rerender(
      <OnboardingTurnstile
        onToken={vi.fn()}
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

  it('reserves inline space when send is attempted during silent loading', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'site-key');
    const { render: renderMock } = mockTurnstile();

    render(
      <OnboardingTurnstile
        instruction='Verify you are human to send'
        onToken={vi.fn()}
        onStateChange={vi.fn()}
      />
    );

    await waitFor(() => expect(renderMock).toHaveBeenCalled());
    expect(
      screen.getByTestId('onboarding-turnstile-widget-frame')
    ).toHaveAttribute('data-turnstile-mount', 'inline');
    expect(
      isOnboardingTurnstilePanelVisible(
        { status: 'loading' },
        'Verify you are human to send'
      )
    ).toBe(true);
  });

  it('retries a stalled silent execute pass', async () => {
    vi.useFakeTimers();
    try {
      vi.stubEnv('NODE_ENV', 'test');
      vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'site-key');
      const { render: renderMock, remove: removeMock } = mockTurnstile();

      render(<OnboardingTurnstile onToken={vi.fn()} onStateChange={vi.fn()} />);

      await act(async () => {
        await Promise.resolve();
      });
      expect(renderMock).toHaveBeenCalledTimes(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(
          ONBOARDING_TURNSTILE_LOADING_STALL_MS
        );
      });
      expect(removeMock).toHaveBeenCalled();
      expect(renderMock.mock.calls.length).toBeGreaterThan(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
