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

import { expectNoA11yViolations } from '@/tests/utils/a11y';
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
    await expectNoA11yViolations(container);
  });

  it('swallows a dismissed or unauthorized prompt and adds no markup', async () => {
    oneTapMock.mockRejectedValue(new Error('One Tap dismissed'));
    const { container } = render(
      <GoogleOneTap mode='sign-up' suppress={false} />
    );

    await waitFor(() => {
      expect(oneTapMock).toHaveBeenCalledWith({
        callbackURL: '/signup',
        context: 'signup',
      });
    });
    expect(container).toBeEmptyDOMElement();
    await expectNoA11yViolations(container);
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

  it('skips One Tap on a phone, where its sheet would cover the form', async () => {
    const original = globalThis.matchMedia;
    globalThis.matchMedia = vi.fn((query: string) => ({
      matches: query === '(max-width: 599px)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof globalThis.matchMedia;

    try {
      render(<GoogleOneTap mode='sign-in' suppress={false} />);

      await waitFor(() => {
        expect(oneTapMock).not.toHaveBeenCalled();
      });
    } finally {
      globalThis.matchMedia = original;
    }
  });

  it('skips One Tap in the sign-in dialog without FedCM', async () => {
    Reflect.deleteProperty(globalThis.window, 'IdentityCredential');
    render(<GoogleOneTap mode='sign-in' suppress={false} inDialog />);

    await waitFor(() => {
      expect(oneTapMock).not.toHaveBeenCalled();
    });
  });

  it('prompts One Tap in the sign-in dialog when FedCM draws it', async () => {
    Object.defineProperty(globalThis.window, 'IdentityCredential', {
      configurable: true,
      value: function IdentityCredential() {},
    });

    try {
      render(<GoogleOneTap mode='sign-in' suppress={false} inDialog />);

      await waitFor(() => {
        expect(oneTapMock).toHaveBeenCalledTimes(1);
      });
    } finally {
      Reflect.deleteProperty(globalThis.window, 'IdentityCredential');
    }
  });

  it('skips One Tap while suppressed', async () => {
    render(<GoogleOneTap mode='sign-up' suppress />);

    await waitFor(() => {
      expect(oneTapMock).not.toHaveBeenCalled();
    });
  });
});
