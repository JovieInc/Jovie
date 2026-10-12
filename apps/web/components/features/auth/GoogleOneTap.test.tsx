import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { oneTapConfiguredState, oneTapMock } = vi.hoisted(() => ({
  oneTapConfiguredState: { value: true },
  oneTapMock: vi.fn(),
}));

vi.mock('@/lib/auth/client', () => ({
  authClient: { oneTap: oneTapMock },
  isGoogleOneTapConfigured: () => oneTapConfiguredState.value,
}));

import { GoogleOneTap } from './GoogleOneTap';

describe('GoogleOneTap', () => {
  beforeEach(() => {
    oneTapConfiguredState.value = true;
    oneTapMock.mockReset();
    oneTapMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    delete document.documentElement.dataset.e2eMode;
  });

  it('prompts One Tap with the mode-local callback when configured', async () => {
    const { container } = render(
      <GoogleOneTap mode='sign-in' suppress={false} />
    );

    await waitFor(() => {
      expect(oneTapMock).toHaveBeenCalledWith({
        callbackURL: '/signin',
        context: 'signin',
      });
    });
    expect(container).toBeEmptyDOMElement();
  });

  it('skips One Tap when the root layout marks managed e2e/audit mode', async () => {
    document.documentElement.dataset.e2eMode = '1';
    render(<GoogleOneTap mode='sign-up' suppress={false} />);

    await waitFor(() => {
      expect(oneTapMock).not.toHaveBeenCalled();
    });
  });

  it('skips One Tap under WebDriver automation', async () => {
    Object.defineProperty(globalThis.navigator, 'webdriver', {
      configurable: true,
      get: () => true,
    });

    try {
      render(<GoogleOneTap mode='sign-up' suppress={false} />);

      await waitFor(() => {
        expect(oneTapMock).not.toHaveBeenCalled();
      });
    } finally {
      Reflect.deleteProperty(globalThis.navigator, 'webdriver');
    }
  });

  it('skips One Tap while suppressed', async () => {
    render(<GoogleOneTap mode='sign-up' suppress />);

    await waitFor(() => {
      expect(oneTapMock).not.toHaveBeenCalled();
    });
  });
});
