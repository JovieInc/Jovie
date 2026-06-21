import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InvisibleTurnstile } from '@/components/atoms/InvisibleTurnstile';

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

describe('InvisibleTurnstile', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    delete document.documentElement.dataset.e2eMode;
    delete window.turnstile;
  });

  it('renders the managed widget and returns a token when configured', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'site-key');
    const onToken = vi.fn();
    const renderMock = vi.fn(
      (_target: HTMLElement, _options: TurnstileOptions) => 'widget-1'
    );
    window.turnstile = {
      render: renderMock,
      reset: vi.fn(),
      remove: vi.fn(),
    };

    render(<InvisibleTurnstile onToken={onToken} />);

    await waitFor(() => {
      expect(renderMock).toHaveBeenCalledWith(
        expect.any(HTMLElement),
        expect.objectContaining({
          sitekey: 'site-key',
          appearance: 'execute',
          size: 'compact',
        })
      );
    });

    act(() => {
      renderMock.mock.calls[0]?.[1].callback('turnstile-token');
    });
    expect(onToken).toHaveBeenCalledWith('turnstile-token');
    expect(
      screen.getByTestId('invisible-turnstile-widget')
    ).toBeInTheDocument();
  });

  it('bypasses verification in runtime E2E mode', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'site-key');
    document.documentElement.dataset.e2eMode = '1';
    const onToken = vi.fn();
    const renderMock = vi.fn(
      (_target: HTMLElement, _options: TurnstileOptions) => 'widget-1'
    );
    window.turnstile = {
      render: renderMock,
      reset: vi.fn(),
      remove: vi.fn(),
    };

    render(<InvisibleTurnstile onToken={onToken} />);

    expect(screen.queryByTestId('next-script')).not.toBeInTheDocument();
    await waitFor(() => {
      expect(onToken).toHaveBeenCalledWith('local-dev-turnstile-bypass');
    });
    expect(renderMock).not.toHaveBeenCalled();
  });

  it('returns null when the site key is missing', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', '');
    const onToken = vi.fn();

    const { container } = render(<InvisibleTurnstile onToken={onToken} />);

    expect(container).toBeEmptyDOMElement();
    expect(onToken).not.toHaveBeenCalled();
  });

  it('clears the token when reset externally', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'site-key');
    const onToken = vi.fn();
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
      <InvisibleTurnstile onToken={onToken} resetSignal={0} />
    );

    await waitFor(() => expect(renderMock).toHaveBeenCalledTimes(1));
    act(() => {
      renderMock.mock.calls[0]?.[1].callback('turnstile-token');
    });
    expect(onToken).toHaveBeenCalledWith('turnstile-token');

    onToken.mockClear();
    rerender(<InvisibleTurnstile onToken={onToken} resetSignal={1} />);

    expect(removeMock).toHaveBeenCalledWith('widget-1');
    expect(onToken).toHaveBeenCalledWith('');
    expect(renderMock).toHaveBeenCalledTimes(2);
  });
});
