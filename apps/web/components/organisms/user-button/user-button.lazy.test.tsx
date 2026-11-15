import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const captureException = vi.fn();
vi.mock('@/lib/sentry/client-lite', () => ({ captureException }));

describe('loadUserButton', () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock('./UserButton');
    captureException.mockReset();
  });

  it('renders nothing and reports when the account chunk fails to load', async () => {
    vi.doMock('./UserButton', () => {
      throw new Error('Loading chunk 4821 failed.');
    });
    const { loadUserButton } = await import('./user-button.lazy');

    const Fallback = await loadUserButton();
    const { container } = render(<Fallback />);

    expect(container).toBeEmptyDOMElement();
    expect(captureException).toHaveBeenCalledTimes(1);
    const [reported, context] = captureException.mock.calls[0];
    // vitest wraps a throwing mock factory; the chunk error is its cause.
    expect(String(reported.cause ?? reported)).toContain('Loading chunk');
    expect(context).toEqual({ tags: { surface: 'marketing-account-slot' } });
  });

  it('resolves to the real account button when the chunk loads', async () => {
    const UserButton = () => <button type='button'>Account</button>;
    vi.doMock('./UserButton', () => ({ UserButton }));
    const { loadUserButton } = await import('./user-button.lazy');

    await expect(loadUserButton()).resolves.toBe(UserButton);
    expect(captureException).not.toHaveBeenCalled();
  });
});
