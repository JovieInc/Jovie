import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { OnboardingTurnstile } from './OnboardingTurnstile';

type TurnstileOptions = Parameters<
  NonNullable<Window['turnstile']>['render']
>[1];

// The real Cloudflare loader never runs here: next/script is a stub that
// reports load, and window.turnstile is a local stand-in.
vi.mock('next/script', () => ({
  default: ({ onLoad }: { readonly onLoad?: () => void }) => {
    queueMicrotask(() => onLoad?.());
    return null;
  },
}));

function stubTurnstile(paintsWidget = false) {
  const render = vi.fn((target: HTMLElement, _options: TurnstileOptions) => {
    if (paintsWidget) target.append(document.createElement('div'));
    return 'widget-1';
  });
  window.turnstile = { render, reset: vi.fn(), remove: vi.fn() };
  return render;
}

async function mountWithSiteKey(instruction?: string, paintsWidget = false) {
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'site-key');
  const renderMock = stubTurnstile(paintsWidget);
  const onStateChange = vi.fn();
  const view = render(
    <OnboardingTurnstile
      onToken={vi.fn()}
      onStateChange={onStateChange}
      instruction={instruction}
    />
  );
  await waitFor(() => expect(renderMock).toHaveBeenCalled());
  const options = renderMock.mock.calls[0]?.[1] as TurnstileOptions;
  return { ...view, onStateChange, options };
}

const frame = () => screen.getByTestId('onboarding-turnstile-widget-frame');

// State and accessibility coverage for each state the widget can render.
// Provider lifecycle contracts live in tests/unit/onboarding.
describe('OnboardingTurnstile states', () => {
  beforeEach(() => {
    delete document.documentElement.dataset.e2eMode;
    delete window.turnstile;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('keeps the silent mount out of the accessibility tree while loading', async () => {
    const { container } = await mountWithSiteKey();

    expect(frame()).toHaveAttribute('data-turnstile-status', 'loading');
    expect(frame()).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('status')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('announces the send instruction while the check is still pending', async () => {
    const { container } = await mountWithSiteKey(
      'One quick check before we send'
    );

    expect(screen.getByRole('status')).toHaveTextContent(
      'One quick check before we send'
    );
    expect(frame()).toHaveAttribute('data-turnstile-mount', 'silent');
    await expectNoA11yViolations(container);
  });

  it('wraps a long instruction inside a right-to-left page', async () => {
    const instruction =
      'One quick check before we send your first message, so Jovie knows a real artist is starting this conversation';
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'site-key');
    const renderMock = stubTurnstile();
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <OnboardingTurnstile
          onToken={vi.fn()}
          onStateChange={vi.fn()}
          instruction={instruction}
        />
      </div>
    );

    await waitFor(() => expect(renderMock).toHaveBeenCalled());
    expect(screen.getByRole('status')).toHaveTextContent(instruction);
    await expectNoA11yViolations(container);
  });

  it('keeps an interactive challenge hidden until the provider paints', async () => {
    const { container, options } = await mountWithSiteKey();

    act(() => options['before-interactive-callback']?.());
    expect(frame()).toHaveAttribute('data-turnstile-status', 'interactive');
    expect(frame()).toHaveAttribute('data-turnstile-mount', 'silent');
    await expectNoA11yViolations(container);
  });

  it('reveals a painted interactive challenge inline', async () => {
    const { container, options } = await mountWithSiteKey(undefined, true);

    act(() => options['before-interactive-callback']?.());
    await waitFor(() =>
      expect(frame()).toHaveAttribute('data-turnstile-mount', 'inline')
    );
    expect(frame()).not.toHaveAttribute('aria-hidden');
    await expectNoA11yViolations(container);
  });

  it.each([
    ['error-callback', 'error'],
    ['unsupported-callback', 'unsupported'],
  ] as const)(
    'reports %s to the shell and shows no inline failure card',
    async (callback, status) => {
      const { container, onStateChange, options } = await mountWithSiteKey();

      act(() => options[callback]?.('600010'));
      expect(onStateChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ status, message: expect.any(String) })
      );
      expect(frame()).toHaveAttribute('data-turnstile-status', status);
      expect(frame()).toHaveAttribute('data-turnstile-mount', 'silent');
      expect(screen.queryByRole('status')).toBeNull();
      await expectNoA11yViolations(container);
    }
  );

  it('stays silent after a verified token', async () => {
    const { container, options } = await mountWithSiteKey();

    act(() => options.callback('turnstile-token'));
    expect(frame()).toHaveAttribute('data-turnstile-status', 'verified');
    await expectNoA11yViolations(container);
  });

  it('renders nothing when no site key is configured', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', '');
    const onStateChange = vi.fn();
    const { container } = render(
      <OnboardingTurnstile onToken={vi.fn()} onStateChange={onStateChange} />
    );

    await waitFor(() =>
      expect(onStateChange).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'unconfigured' })
      )
    );
    expect(container).toBeEmptyDOMElement();
    await expectNoA11yViolations(container);
  });
});
