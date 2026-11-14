import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AcquisitionCapture } from './AcquisitionCapture';

const consent = vi.hoisted(() => ({
  allowed: true,
  clearAcquisitionId: vi.fn(),
  rememberAcquisitionId: vi.fn(),
  getOrCreateAcquisitionId: vi.fn(() => 'acq-123'),
  onChange: vi.fn(),
  unsubscribe: vi.fn(),
}));
const runtime = vi.hoisted(() => ({
  e2eMode: undefined as string | undefined,
  pathname: '/artist',
}));

vi.mock('next/navigation', () => ({
  usePathname: () => runtime.pathname,
}));

vi.mock('@/lib/env-public', () => ({
  publicEnv: {
    get NEXT_PUBLIC_E2E_MODE() {
      return runtime.e2eMode;
    },
  },
}));

vi.mock('@/lib/tracking/consent', () => ({
  clearAcquisitionId: consent.clearAcquisitionId,
  rememberAcquisitionId: consent.rememberAcquisitionId,
  getOrCreateAcquisitionId: consent.getOrCreateAcquisitionId,
  isAnalyticsAllowed: () => consent.allowed,
}));

describe('AcquisitionCapture', () => {
  beforeEach(() => {
    runtime.e2eMode = undefined;
    runtime.pathname = '/artist';
    consent.allowed = true;
    consent.clearAcquisitionId.mockClear();
    consent.getOrCreateAcquisitionId.mockClear();
    consent.unsubscribe.mockClear();
    consent.onChange.mockReset();
    consent.onChange.mockReturnValue(consent.unsubscribe);
    globalThis.JVConsent = {
      onChange: consent.onChange,
      _emit: vi.fn(),
      openModal: vi.fn(),
    };
    globalThis.localStorage.clear();
    globalThis.history.replaceState(
      {},
      '',
      '/artist?utm_source=instagram&claim_id=claim-1'
    );
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response()));
  });

  it('stays inactive in deterministic E2E and visual capture', () => {
    runtime.e2eMode = '1';

    render(<AcquisitionCapture />);

    expect(fetch).not.toHaveBeenCalled();
    expect(consent.onChange).not.toHaveBeenCalled();
  });

  it('does not persist or send a checkout return URL, even after consent changes', () => {
    runtime.pathname = '/artist/tip/thank-you';
    globalThis.history.replaceState(
      {},
      '',
      `${runtime.pathname}?session_id=cs_test_private`
    );
    render(<AcquisitionCapture />);
    const reconcileConsent = consent.onChange.mock.calls[0][0];
    act(() => reconcileConsent());
    expect(fetch).not.toHaveBeenCalled();
    expect(consent.getOrCreateAcquisitionId).not.toHaveBeenCalled();
    expect(globalThis.localStorage.length).toBe(0);
  });

  afterEach(() => {
    globalThis.JVConsent = undefined;
    vi.unstubAllGlobals();
  });

  it('persists first-touch context and posts the acquisition identity', async () => {
    const { unmount } = render(<AcquisitionCapture />);

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const [, request] = vi.mocked(fetch).mock.calls[0];
    expect(JSON.parse(String(request?.body))).toMatchObject({
      acquisitionId: 'acq-123',
      currentPath: '/artist',
      firstTouch: {
        source: 'instagram',
        claimId: 'claim-1',
        landingPath: '/artist?utm_source=instagram&claim_id=claim-1',
      },
    });

    unmount();
    expect(consent.unsubscribe).toHaveBeenCalledOnce();
  });

  it('captures again on client navigation into /pricing for the funnel stage', async () => {
    const { rerender } = render(<AcquisitionCapture />);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

    runtime.pathname = '/about';
    rerender(<AcquisitionCapture />);
    runtime.pathname = '/pricing';
    globalThis.history.replaceState({}, '', '/pricing');
    rerender(<AcquisitionCapture />);

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    const [, request] = vi.mocked(fetch).mock.calls[1];
    expect(JSON.parse(String(request?.body))).toMatchObject({
      currentPath: '/pricing',
    });
  });

  it('adopts the server-verified handoff identity for subsequent events and revocation', async () => {
    const acquisitionId = '7f5bb735-8e88-4d78-ae32-5228cc12a8bb';
    vi.mocked(fetch).mockResolvedValue(Response.json({ acquisitionId }));
    render(<AcquisitionCapture />);
    await waitFor(() =>
      expect(consent.rememberAcquisitionId).toHaveBeenCalledWith(acquisitionId)
    );
  });

  it('clears the acquisition identity when consent is revoked', () => {
    render(<AcquisitionCapture />);
    const reconcileConsent = consent.onChange.mock.calls[0][0];

    consent.allowed = false;
    act(() => reconcileConsent());

    expect(consent.clearAcquisitionId).toHaveBeenCalledOnce();
  });

  it('resubscribes to consent changes when the consent manager announces it is ready', async () => {
    const lateUnsubscribe = vi.fn();
    render(<AcquisitionCapture />);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(consent.onChange).toHaveBeenCalledTimes(1);

    consent.onChange.mockReturnValue(lateUnsubscribe);
    fireEvent(globalThis.window, new Event('jvconsent:ready'));

    expect(consent.unsubscribe).toHaveBeenCalledOnce();
    expect(consent.onChange).toHaveBeenCalledTimes(2);

    const reconcileConsent = consent.onChange.mock.calls[1][0];
    act(() => reconcileConsent());
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  });

  it('swallows a failed acquisition request without remembering an identity', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'));
    consent.rememberAcquisitionId.mockClear();

    const { container } = render(<AcquisitionCapture />);

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    await act(async () => {
      await Promise.resolve();
    });
    expect(consent.rememberAcquisitionId).not.toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
    await expectNoA11yViolations(container);
  });

  it('renders no markup and has no axe violations', async () => {
    const { container } = render(<AcquisitionCapture />);
    expect(container).toBeEmptyDOMElement();
    await expectNoA11yViolations(container);
  });
});

describe('prerendered homepage pathname', () => {
  it('AcquisitionCapture.tsx reads "/index" as "/" via usePublicPathname', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const source = readFileSync(
      resolve(
        process.cwd(),
        'components/features/tracking/AcquisitionCapture.tsx'
      ),
      'utf8'
    );
    expect(source).toContain('usePublicPathname');
    expect(source).not.toMatch(/\busePathname\b/);
  });
});
