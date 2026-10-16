import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
      firstTouch: {
        source: 'instagram',
        claimId: 'claim-1',
        landingPath: '/artist?utm_source=instagram&claim_id=claim-1',
      },
    });

    unmount();
    expect(consent.unsubscribe).toHaveBeenCalledOnce();
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
});
