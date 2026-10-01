import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockMobile = vi.hoisted(() => ({ value: false }));

const mockSaveConsent = vi.fn().mockResolvedValue(undefined);

vi.mock('@/lib/cookies/consent', () => ({
  saveConsent: mockSaveConsent,
}));

vi.mock('@/lib/tracking/consent', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/lib/tracking/consent')>();
  return { ...actual, setConsentState: vi.fn() };
});

vi.mock('@/hooks/useMediaQuery', () => ({
  useMediaQuery: () => mockMobile.value,
}));

function setCookie(value: string) {
  Object.defineProperty(document, 'cookie', {
    configurable: true,
    writable: true,
    value,
  });
}

describe('cookie banner coverage receipts', () => {
  it('asserts exact CookieBannerSection and CookieModal sources', () => {
    const bannerSource = readFileSync(
      resolve(process.cwd(), 'components/organisms/CookieBannerSection.tsx'),
      'utf8'
    );
    expect(bannerSource).toContain('export function CookieBannerSection');
    expect(bannerSource).not.toMatch(/--linear-app-/);
    const modalSource = readFileSync(
      resolve(process.cwd(), 'components/organisms/CookieModal.tsx'),
      'utf8'
    );
    expect(modalSource).toContain('export function CookieModal');
    expect(modalSource).toContain('function CookiePreferencesSaveButton');
    expect(modalSource).toContain(
      '<CookiePreferencesSaveButton\n' +
        '              isSaving={isSaving}\n' +
        '              onSave={save}'
    );
  });
});

describe('CookieBannerSection consent sync', () => {
  // Floating card redesign (bottom-right compact surface) preserves all action handlers,
  // persistence, error paths, and modal open. New render tested in sibling cookie-banner.test.tsx
  // (positioning, classes, height var, no Manage chrome, compact actions prop).
  beforeEach(() => {
    vi.resetModules();
    mockSaveConsent.mockResolvedValue(undefined);
    localStorage.clear();
  });

  afterEach(() => {
    setCookie('');
    globalThis.JVConsent = undefined;
    vi.unstubAllEnvs();
  });

  it('uses the E2E-only pathname override to clear the public profile dock', async () => {
    vi.stubEnv('NEXT_PUBLIC_E2E_MODE', '1');
    const mod = await import('@/components/organisms/CookieBannerSection');
    setCookie('jv_cc_required=1');
    render(
      <mod.CookieBannerSection testOnlyPathname='/profile-admission-fixture' />
    );

    expect(screen.getByTestId('cookie-banner')).toHaveClass(
      'cookie-banner-card--above-public-profile-dock'
    );
  });

  it('anchors the phone profile consent card above the dock stack, not over the identity (JOV-7114)', () => {
    const css = readFileSync(
      resolve(process.cwd(), 'styles/design-system.css'),
      'utf8'
    );
    const phoneRule =
      /@media \(max-width: 767px\)[\s\S]*?\.cookie-banner-card--above-public-profile-dock \{([^}]*)\}/.exec(
        css
      )?.[1];

    expect(phoneRule).toContain('top: auto;');
    expect(phoneRule).toContain('bottom: var(--profile-bottom-nav-height);');
  });

  it('calls setConsentState accepted on acceptAll', async () => {
    const { setConsentState } = await import('@/lib/tracking/consent');
    const mod = await import('@/components/organisms/CookieBannerSection');
    setCookie('jv_cc_required=1');
    render(<mod.CookieBannerSection />);

    const btn = screen.getByRole('button', { name: 'Accept all' });
    fireEvent.click(btn);

    await vi.waitFor(() => {
      expect(setConsentState).toHaveBeenCalledWith('accepted');
      const saved = localStorage.getItem('jv_cc');
      expect(saved).toBeTruthy();
      const parsed = JSON.parse(saved!);
      expect(parsed.marketing).toBe(true);
    });
  });

  it('keeps banner visible on acceptAll when saveConsent rejects', async () => {
    mockSaveConsent.mockRejectedValue(new Error('server error'));
    const mod = await import('@/components/organisms/CookieBannerSection');
    setCookie('jv_cc_required=1');
    render(<mod.CookieBannerSection />);

    expect(screen.getByTestId('cookie-banner')).toBeInTheDocument();

    const btn = screen.getByRole('button', { name: 'Accept all' });
    fireEvent.click(btn);

    await vi.waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        /could not save preferences/i
      );
    });
    expect(screen.getByTestId('cookie-banner')).toBeInTheDocument();
    expect(localStorage.getItem('jv_cc')).toBeNull();
  });

  it('persists consent to localStorage after server action on acceptAll', async () => {
    const mod = await import('@/components/organisms/CookieBannerSection');
    setCookie('jv_cc_required=1');
    render(<mod.CookieBannerSection />);

    fireEvent.click(screen.getByRole('button', { name: 'Accept all' }));

    await vi.waitFor(() => {
      const saved = localStorage.getItem('jv_cc');
      expect(saved).toBeTruthy();
      expect(JSON.parse(saved!)).toMatchObject({
        essential: true,
        analytics: true,
        marketing: true,
      });
    });
  });

  it('calls setConsentState rejected on reject all', async () => {
    const { setConsentState } = await import('@/lib/tracking/consent');
    const mod = await import('@/components/organisms/CookieBannerSection');
    setCookie('jv_cc_required=1');
    render(<mod.CookieBannerSection />);

    const btn = screen.getByRole('button', { name: 'Reject all' });
    fireEvent.click(btn);

    await vi.waitFor(() => {
      expect(setConsentState).toHaveBeenCalledWith('rejected');
      const saved = localStorage.getItem('jv_cc');
      expect(saved).toBeTruthy();
      const parsed = JSON.parse(saved!);
      expect(parsed).toMatchObject({
        essential: true,
        analytics: false,
        marketing: false,
      });
    });
  });

  it('persists reject-all as essential-only after the server action', async () => {
    const mod = await import('@/components/organisms/CookieBannerSection');
    setCookie('jv_cc_required=1');
    render(<mod.CookieBannerSection />);

    fireEvent.click(screen.getByRole('button', { name: 'Reject all' }));

    await vi.waitFor(() => {
      expect(JSON.parse(localStorage.getItem('jv_cc')!)).toEqual({
        essential: true,
        analytics: false,
        marketing: false,
      });
    });
    expect(screen.queryByTestId('cookie-banner')).not.toBeInTheDocument();
  });

  it.each(['Accept all', 'Reject all'])(
    'returns keyboard focus to the originating page action after %s',
    async name => {
      let finishSave!: () => void;
      mockSaveConsent.mockImplementationOnce(
        () =>
          new Promise<void>(resolveSave => {
            finishSave = resolveSave;
          })
      );
      const mod = await import('@/components/organisms/CookieBannerSection');
      setCookie('jv_cc_required=1');
      render(
        <>
          <main>
            <button type='button'>Listen now</button>
          </main>
          <mod.CookieBannerSection />
        </>
      );
      const origin = screen.getByRole('button', { name: 'Listen now' });
      const action = screen.getByRole('button', { name });
      origin.focus();
      action.focus();
      fireEvent.click(action);
      // Native browsers blur a focused button when it becomes disabled.
      action.blur();
      await act(async () => {
        finishSave();
      });
      expect(screen.queryByTestId('cookie-banner')).not.toBeInTheDocument();
      expect(origin).toHaveFocus();
    }
  );

  it('does not steal focus moved elsewhere while consent is saving', async () => {
    let finishSave!: () => void;
    mockSaveConsent.mockImplementationOnce(
      () =>
        new Promise<void>(resolveSave => {
          finishSave = resolveSave;
        })
    );
    const mod = await import('@/components/organisms/CookieBannerSection');
    setCookie('jv_cc_required=1');
    render(
      <>
        <main>
          <button type='button'>Claim yours</button>
        </main>
        <mod.CookieBannerSection />
      </>
    );
    const action = screen.getByRole('button', { name: 'Reject all' });
    action.focus();
    fireEvent.click(action);
    const destination = screen.getByRole('button', { name: 'Claim yours' });
    destination.focus();
    await act(async () => {
      finishSave();
    });
    expect(destination).toHaveFocus();
  });

  it('keeps keyboard focus on the consent action after a recoverable save error', async () => {
    let failSave!: (error: Error) => void;
    mockSaveConsent.mockImplementationOnce(
      () =>
        new Promise<void>((_, rejectSave) => {
          failSave = rejectSave;
        })
    );
    const mod = await import('@/components/organisms/CookieBannerSection');
    setCookie('jv_cc_required=1');
    render(<mod.CookieBannerSection />);
    const action = screen.getByRole('button', { name: 'Reject all' });
    action.focus();
    fireEvent.click(action);
    action.blur();
    await act(async () => {
      failSave(new Error('Offline'));
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      /could not save preferences/i
    );
    expect(action).toBeEnabled();
    expect(action).toHaveFocus();
    expect(localStorage.getItem('jv_cc')).toBeNull();
  });

  it('uses the page primary action when no prior external focus exists', async () => {
    const mod = await import('@/components/organisms/CookieBannerSection');
    setCookie('jv_cc_required=1');
    render(
      <>
        <main>
          <button type='button'>Listen now</button>
        </main>
        <mod.CookieBannerSection />
      </>
    );
    const action = screen.getByRole('button', { name: 'Reject all' });
    action.focus();
    fireEvent.click(action);
    await vi.waitFor(() =>
      expect(screen.queryByTestId('cookie-banner')).not.toBeInTheDocument()
    );
    expect(screen.getByRole('button', { name: 'Listen now' })).toHaveFocus();
  });

  it.each(['removed', 'disabled', 'hidden'])(
    'falls back to an available page action when prior focus is %s',
    async state => {
      const mod = await import('@/components/organisms/CookieBannerSection');
      setCookie('jv_cc_required=1');
      render(
        <>
          <main>
            <button type='button'>Previous</button>
            <button type='button'>Listen now</button>
          </main>
          <mod.CookieBannerSection />
        </>
      );
      const previous = screen.getByRole('button', { name: 'Previous' });
      previous.focus();
      const action = screen.getByRole('button', { name: 'Reject all' });
      action.focus();
      if (state === 'removed') previous.remove();
      else if (state === 'disabled') previous.setAttribute('disabled', '');
      else previous.setAttribute('hidden', '');
      fireEvent.click(action);
      await vi.waitFor(() =>
        expect(screen.queryByTestId('cookie-banner')).not.toBeInTheDocument()
      );
      expect(screen.getByRole('button', { name: 'Listen now' })).toHaveFocus();
    }
  );

  it('leaves page focus unchanged for an unfocused pointer dismissal', async () => {
    const mod = await import('@/components/organisms/CookieBannerSection');
    setCookie('jv_cc_required=1');
    render(
      <>
        <main>
          <button type='button'>Listen now</button>
        </main>
        <mod.CookieBannerSection />
      </>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reject all' }));
    await vi.waitFor(() =>
      expect(screen.queryByTestId('cookie-banner')).not.toBeInTheDocument()
    );
    expect(document.body).toHaveFocus();
  });

  it('customizes analytics only and leaves marketing blocked', async () => {
    const { setConsentState } = await import('@/lib/tracking/consent');
    const mod = await import('@/components/organisms/CookieBannerSection');
    setCookie('jv_cc_required=1');
    render(<mod.CookieBannerSection />);

    fireEvent.click(screen.getByRole('button', { name: 'Customize' }));
    expect(screen.queryByTestId('cookie-banner')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('switch', { name: /analytics/i }));
    fireEvent.click(screen.getByRole('button', { name: /save preferences/i }));

    await vi.waitFor(() => {
      expect(mockSaveConsent).toHaveBeenCalledWith({
        essential: true,
        analytics: true,
        marketing: false,
      });
      expect(setConsentState).toHaveBeenCalledWith('accepted');
      expect(JSON.parse(localStorage.getItem('jv_cc')!)).toMatchObject({
        essential: true,
        analytics: true,
        marketing: false,
      });
    });
  });

  it('keeps banner visible on reject when saveConsent rejects', async () => {
    mockSaveConsent.mockRejectedValue(new Error('server error'));
    const mod = await import('@/components/organisms/CookieBannerSection');
    setCookie('jv_cc_required=1');
    render(<mod.CookieBannerSection />);

    expect(screen.getByTestId('cookie-banner')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reject all' }));

    await vi.waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        /could not save preferences/i
      );
    });
    expect(screen.getByTestId('cookie-banner')).toBeInTheDocument();
    expect(localStorage.getItem('jv_cc')).toBeNull();
  });
});

describe('CookieModal loads saved preferences', () => {
  beforeEach(() => {
    mockSaveConsent.mockResolvedValue(undefined);
  });

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    globalThis.JVConsent = undefined;
  });

  it('initializes with saved preferences from localStorage', async () => {
    localStorage.setItem(
      'jv_cc',
      JSON.stringify({ essential: true, analytics: true, marketing: true })
    );

    const { CookieModal } = await import('@/components/organisms/CookieModal');
    render(<CookieModal open onClose={vi.fn()} />);

    const analyticsSwitch = screen.getByRole('switch', { name: /analytics/i });
    const marketingSwitch = screen.getByRole('switch', { name: /marketing/i });

    expect(analyticsSwitch).toBeChecked();
    expect(marketingSwitch).toBeChecked();
  });

  it('defaults to off when no saved preferences', async () => {
    const { CookieModal } = await import('@/components/organisms/CookieModal');
    render(<CookieModal open onClose={vi.fn()} />);

    const analyticsSwitch = screen.getByRole('switch', { name: /analytics/i });
    const marketingSwitch = screen.getByRole('switch', { name: /marketing/i });

    expect(analyticsSwitch).not.toBeChecked();
    expect(marketingSwitch).not.toBeChecked();
  });

  it('exposes an accessible dialog description', async () => {
    const { CookieModal } = await import('@/components/organisms/CookieModal');
    render(<CookieModal open onClose={vi.fn()} />);

    expect(screen.getByRole('dialog')).toHaveAccessibleDescription(
      'Manage your cookie preferences'
    );
  });

  it('keeps consent controls on a 44px touch-target floor', async () => {
    const { CookieModal } = await import('@/components/organisms/CookieModal');
    render(<CookieModal open onClose={vi.fn()} />);

    for (const control of screen.getAllByRole('switch')) {
      expect(control.className).toContain('before:h-12');
      expect(control.className).toContain('before:w-12');
    }
    for (const name of [/cancel/i, /save preferences/i]) {
      const action = screen.getByRole('button', { name });
      expect(action).toHaveAttribute('data-size', 'marketing');
      expect(action.className.split(' ')).toContain('min-h-7');
      expect(action.className.split(' ')).toContain('h-auto');
      expect(action.className.split(' ')).toContain('my-2');
      expect(action.className.split(' ')).not.toContain('min-h-12');
    }
    expect(
      screen.getByRole('link', { name: /cookie policy/i }).className
    ).toContain('min-h-12');
    const close = screen.getByRole('button', { name: 'Close' });
    // CookieModal consumes Dialog's shared close atom: 36px visible, 44px hit target.
    expect(close.className).toContain('size-9');
    expect(close.className).toContain('before:h-11');
    expect(close.className).toContain('before:w-11');
    expect(close.className).not.toContain('size-12');
  });

  it.each([false, true])(
    'cancels unsaved preferences without persisting (mobile=%s)',
    async mobile => {
      mockMobile.value = mobile;
      const onClose = vi.fn();
      const onSave = vi.fn();
      const beforeSaveCalls = mockSaveConsent.mock.calls.length;
      const { CookieModal } = await import(
        '@/components/organisms/CookieModal'
      );
      const { unmount } = render(
        <CookieModal open onClose={onClose} onSave={onSave} />
      );
      try {
        for (const name of [/cancel/i, /save preferences/i]) {
          const action = screen.getByRole('button', { name });
          expect(action).toHaveAttribute('data-size', 'marketing');
          expect(action.className.split(' ')).toContain('my-2');
          expect(action.className.split(' ')).not.toContain('min-h-12');
        }
        fireEvent.click(screen.getByRole('switch', { name: /analytics/i }));
        fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
        expect(onClose).toHaveBeenCalledOnce();
        expect(onSave).not.toHaveBeenCalled();
        expect(mockSaveConsent.mock.calls.length).toBe(beforeSaveCalls);
        expect(localStorage.getItem('jv_cc')).toBeNull();
      } finally {
        unmount();
        mockMobile.value = false;
      }
    }
  );

  it('calls onSave and onClose when Save Preferences succeeds', async () => {
    const onSave = vi.fn();
    const onClose = vi.fn();

    const { CookieModal } = await import('@/components/organisms/CookieModal');
    render(<CookieModal open onClose={onClose} onSave={onSave} />);

    fireEvent.click(screen.getByRole('button', { name: /save preferences/i }));

    await vi.waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it('keeps preferences open when saveConsent rejects', async () => {
    mockSaveConsent.mockRejectedValue(new Error('server error'));
    const onSave = vi.fn();
    const onClose = vi.fn();

    const { CookieModal } = await import('@/components/organisms/CookieModal');
    render(<CookieModal open onClose={onClose} onSave={onSave} />);

    fireEvent.click(screen.getByRole('button', { name: /save preferences/i }));

    await vi.waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        /could not save preferences/i
      );
    });
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('CookieBannerMount global preferences controller', () => {
  beforeEach(() => {
    mockSaveConsent.mockClear();
    mockSaveConsent.mockResolvedValue(undefined);
    localStorage.clear();
  });

  afterEach(() => {
    setCookie('');
    localStorage.clear();
    globalThis.JVConsent = undefined;
    history.pushState({}, '', '/');
  });

  it('opens cookie preferences from the global menu event without a mounted banner', async () => {
    setCookie('jv_cc_required=0');
    const { CookieBannerMount } = await import(
      '@/components/organisms/CookieBannerMount'
    );

    render(<CookieBannerMount />);

    await vi.waitFor(() => {
      expect(globalThis.JVConsent).toBeDefined();
    });
    expect(screen.queryByTestId('cookie-banner')).not.toBeInTheDocument();

    globalThis.dispatchEvent(new CustomEvent('jv:cookie:open'));

    await vi.waitFor(() => {
      expect(
        screen.getByRole('dialog', { name: /cookie preferences/i })
      ).toBeInTheDocument();
    });
  });

  it('does not mount the visible banner on desktop auth handoff routes', async () => {
    history.pushState({}, '', '/desktop-auth');
    setCookie('jv_cc_required=1');
    const { CookieBannerMount } = await import(
      '@/components/organisms/CookieBannerMount'
    );

    render(<CookieBannerMount />);

    await vi.waitFor(() => {
      expect(globalThis.JVConsent).toBeDefined();
    });
    expect(screen.queryByTestId('cookie-banner')).not.toBeInTheDocument();
  });

  it('persists preferences opened from the global controller', async () => {
    setCookie('jv_cc_required=0');
    const { setConsentState } = await import('@/lib/tracking/consent');
    const { CookieBannerMount } = await import(
      '@/components/organisms/CookieBannerMount'
    );

    render(<CookieBannerMount />);

    await vi.waitFor(() => {
      expect(globalThis.JVConsent).toBeDefined();
    });

    globalThis.JVConsent?.openModal();

    await vi.waitFor(() => {
      expect(
        screen.getByRole('dialog', { name: /cookie preferences/i })
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /save preferences/i }));

    await vi.waitFor(() => {
      expect(mockSaveConsent).toHaveBeenCalledTimes(1);
      expect(setConsentState).toHaveBeenCalledWith('rejected');
      expect(localStorage.getItem('jv_cc')).toContain('"essential":true');
    });
  });
});
