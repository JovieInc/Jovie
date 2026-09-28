import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockTrack, mockPostJsonBeacon } = vi.hoisted(() => ({
  mockTrack: vi.fn(),
  mockPostJsonBeacon: vi.fn(),
}));

vi.mock('@/lib/analytics', () => ({
  track: mockTrack,
}));

vi.mock('@/lib/tracking/json-beacon', () => ({
  postJsonBeacon: mockPostJsonBeacon,
}));

import {
  emitProofClaimEvent,
  emitProofViewedIfProofProfile,
  hasStoredProofClaimAttribution,
  rememberProofClaimAttribution,
} from './proof-claim-client';

describe('proof-claim client attribution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    window.history.replaceState({}, '', '/tim');
  });

  afterEach(() => {
    window.sessionStorage.clear();
    window.history.replaceState({}, '', '/');
  });

  it('returns false when the window binding is missing', () => {
    vi.stubGlobal('window', undefined);
    try {
      expect(rememberProofClaimAttribution()).toBe(false);
      expect(hasStoredProofClaimAttribution()).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('remembers attribution from the campaign query and session storage', () => {
    expect(rememberProofClaimAttribution()).toBe(false);
    expect(hasStoredProofClaimAttribution()).toBe(false);

    window.history.replaceState({}, '', '/waitlist?campaign=proof-to-claim');
    expect(rememberProofClaimAttribution()).toBe(true);
    expect(window.sessionStorage.getItem('jovie_proof_claim')).toBe('1');
    expect(hasStoredProofClaimAttribution()).toBe(true);
  });

  it('emits claim_started and persists attribution even without a campaign query', () => {
    emitProofClaimEvent('claim_started', { destination: '/waitlist' });

    expect(window.sessionStorage.getItem('jovie_proof_claim')).toBe('1');
    expect(mockTrack).toHaveBeenCalledWith(
      'claim_started',
      expect.objectContaining({
        campaignKey: 'proof-to-claim',
        destination: '/waitlist',
      })
    );
    expect(mockPostJsonBeacon).toHaveBeenCalledWith(
      '/api/acquisition/proof-claim',
      expect.objectContaining({
        eventType: 'claim_started',
        campaignKey: 'proof-to-claim',
      })
    );
  });

  it('emits proof_viewed only for the M1 proof handle', () => {
    emitProofViewedIfProofProfile('testartist');
    expect(mockTrack).not.toHaveBeenCalled();

    emitProofViewedIfProofProfile('tim');
    expect(mockTrack).toHaveBeenCalledWith(
      'proof_viewed',
      expect.objectContaining({
        campaignKey: 'proof-to-claim',
        profile_handle: 'tim',
      })
    );
  });
});
