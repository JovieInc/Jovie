import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AcquisitionCapture } from './AcquisitionCapture';

const consent = vi.hoisted(() => ({
  allowed: true,
  clearAcquisitionId: vi.fn(),
  getOrCreateAcquisitionId: vi.fn(() => 'acq-123'),
  onChange: vi.fn(),
  unsubscribe: vi.fn(),
}));

vi.mock('@/lib/tracking/consent', () => ({
  clearAcquisitionId: consent.clearAcquisitionId,
  getOrCreateAcquisitionId: consent.getOrCreateAcquisitionId,
  isAnalyticsAllowed: () => consent.allowed,
}));

describe('AcquisitionCapture', () => {
  beforeEach(() => {
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

  it('clears the acquisition identity when consent is revoked', () => {
    render(<AcquisitionCapture />);
    const reconcileConsent = consent.onChange.mock.calls[0][0];

    consent.allowed = false;
    act(() => reconcileConsent());

    expect(consent.clearAcquisitionId).toHaveBeenCalledOnce();
  });
});
