import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InvisibleTurnstile } from '@/components/atoms/InvisibleTurnstile';

type TurnstileOptions = Parameters<
  NonNullable<Window['turnstile']>['render']
>[1];

const scriptMock = vi.hoisted(() => ({ autoLoad: true }));

vi.mock('next/script', () => ({
  default: ({
    onError,
    onLoad,
    src,
  }: {
    readonly onError?: () => void;
    readonly onLoad?: () => void;
    readonly src: string;
  }) => {
    if (scriptMock.autoLoad) queueMicrotask(() => onLoad?.());
    return (
      <button
        type='button'
        data-testid='next-script'
        data-src={src}
        onClick={onError}
      />
    );
  },
}));

describe('InvisibleTurnstile', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    delete document.documentElement.dataset.e2eMode;
    delete window.turnstile;
    delete (window as Window & { __jovieStorybookFixtures?: boolean })
      .__jovieStorybookFixtures;
    scriptMock.autoLoad = true;
  });

  afterEach(() => {
    vi.useRealTimers();
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
    expect(screen.getByTestId('invisible-turnstile-widget')).toHaveClass(
      'h-16',
      'w-80'
    );
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

  it('keeps the Cloudflare script out of deterministic Storybook', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'site-key');
    (
      window as Window & { __jovieStorybookFixtures?: boolean }
    ).__jovieStorybookFixtures = true;
    const onToken = vi.fn();
    const onStateChange = vi.fn();

    render(
      <InvisibleTurnstile onToken={onToken} onStateChange={onStateChange} />
    );

    expect(screen.queryByTestId('next-script')).not.toBeInTheDocument();
    await waitFor(() => {
      expect(onToken).toHaveBeenCalledWith('local-dev-turnstile-bypass');
    });
    expect(onStateChange).toHaveBeenCalledWith({ status: 'bypassed' });
  });

  it('reports a challenge failure without throwing', async () => {
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
      <InvisibleTurnstile onToken={onToken} onStateChange={onStateChange} />
    );

    await waitFor(() => expect(renderMock).toHaveBeenCalled());
    act(() => renderMock.mock.calls[0]?.[1]['error-callback']?.('110200'));

    expect(onToken).toHaveBeenCalledWith('');
    expect(onStateChange).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'error' })
    );
  });

  it('reveals the widget when Cloudflare requires interaction', async () => {
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
      <InvisibleTurnstile onToken={onToken} onStateChange={onStateChange} />
    );

    await waitFor(() => expect(renderMock).toHaveBeenCalled());
    act(() => renderMock.mock.calls[0]?.[1]['before-interactive-callback']?.());

    const widget = screen.getByTestId('invisible-turnstile-widget');
    expect(widget).toHaveAttribute('data-turnstile-mount', 'inline');
    expect(widget).not.toHaveAttribute('aria-hidden');
    expect(widget).toHaveAttribute('aria-label', 'Security Verification');
    expect(widget).toHaveClass('fixed', 'h-[154px]', 'w-[164px]', 'z-50');
    expect(widget).not.toHaveClass('relative');
    expect(onStateChange).toHaveBeenCalledWith({ status: 'interactive' });
  });

  it('reports a Cloudflare script-load failure without throwing', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'site-key');
    const onToken = vi.fn();
    const onStateChange = vi.fn();
    scriptMock.autoLoad = false;

    render(
      <InvisibleTurnstile onToken={onToken} onStateChange={onStateChange} />
    );

    fireEvent.click(screen.getByTestId('next-script'));

    expect(onToken).toHaveBeenCalledWith('');
    expect(onStateChange).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'error' })
    );
  });

  it('reports a loaded script that did not install the Turnstile API', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'site-key');
    const onToken = vi.fn();
    const onStateChange = vi.fn();

    render(
      <InvisibleTurnstile onToken={onToken} onStateChange={onStateChange} />
    );

    await waitFor(() => {
      expect(onStateChange).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'error' })
      );
    });
    expect(onToken).toHaveBeenCalledWith('');
  });

  it('times out when the vendor script never settles', () => {
    vi.useFakeTimers();
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'site-key');
    scriptMock.autoLoad = false;
    const onToken = vi.fn();
    const onStateChange = vi.fn();

    render(
      <InvisibleTurnstile onToken={onToken} onStateChange={onStateChange} />
    );

    act(() => vi.advanceTimersByTime(10_000));

    expect(onToken).toHaveBeenCalledWith('');
    expect(onStateChange).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'timeout' })
    );
  });

  it('returns null when the site key is missing', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', '');
    const onToken = vi.fn();
    const onStateChange = vi.fn();

    const { container } = render(
      <InvisibleTurnstile onToken={onToken} onStateChange={onStateChange} />
    );

    expect(container).toBeEmptyDOMElement();
    expect(onToken).not.toHaveBeenCalled();
    expect(onStateChange).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'unconfigured' })
    );
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
