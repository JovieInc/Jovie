import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OnboardingTurnstile } from '@/components/features/onboarding/OnboardingTurnstile';

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
    const onError = vi.fn();

    render(<OnboardingTurnstile onToken={onToken} onError={onError} />);

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith('turnstile is not configured');
    });
    expect(onToken).not.toHaveBeenCalled();
  });

  it('renders the Cloudflare widget and returns a token when configured', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'site-key');
    const onToken = vi.fn();
    const onError = vi.fn();
    const renderMock = vi.fn(
      (
        _target: HTMLElement,
        options: { readonly callback: (token: string) => void }
      ) => {
        options.callback('turnstile-token');
        return 'widget-1';
      }
    );
    window.turnstile = {
      render: renderMock,
      reset: vi.fn(),
      remove: vi.fn(),
    };

    render(<OnboardingTurnstile onToken={onToken} onError={onError} />);

    await waitFor(() => {
      expect(renderMock).toHaveBeenCalledWith(
        expect.any(HTMLElement),
        expect.objectContaining({
          sitekey: 'site-key',
          appearance: 'interaction-only',
        })
      );
    });
    expect(renderMock.mock.calls[0]?.[1]).not.toHaveProperty('size');
    expect(onToken).toHaveBeenCalledWith('turnstile-token');
    expect(onError).not.toHaveBeenCalled();
  });
});
