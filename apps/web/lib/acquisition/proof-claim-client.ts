'use client';

import { track } from '@/lib/analytics';
import { postJsonBeacon } from '@/lib/tracking/json-beacon';
import {
  isProofClaimFunnelEvent,
  isProofProfileHandle,
  PROOF_CLAIM_CAMPAIGN_KEY,
  PROOF_CLAIM_FUNNEL_EVENTS,
  type ProofClaimFunnelEvent,
  proofClaimAttribution,
} from './proof-claim-funnel';

const STORAGE_KEY = 'jovie_proof_claim';

export function rememberProofClaimAttribution(): boolean {
  if (typeof globalThis.window === 'undefined') return false;
  try {
    const params = new URLSearchParams(globalThis.window.location.search);
    const fromUrl = params.get('campaign') === PROOF_CLAIM_CAMPAIGN_KEY;
    const stored = globalThis.window.sessionStorage.getItem(STORAGE_KEY);
    if (fromUrl || stored === '1') {
      globalThis.window.sessionStorage.setItem(STORAGE_KEY, '1');
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

export function hasStoredProofClaimAttribution(): boolean {
  if (typeof globalThis.window === 'undefined') return false;
  try {
    return (
      globalThis.window.sessionStorage.getItem(STORAGE_KEY) === '1' ||
      new URLSearchParams(globalThis.window.location.search).get('campaign') ===
        PROOF_CLAIM_CAMPAIGN_KEY
    );
  } catch {
    return false;
  }
}

export function emitProofClaimEvent(
  eventType: ProofClaimFunnelEvent,
  properties?: Record<string, unknown>
): void {
  if (!isProofClaimFunnelEvent(eventType)) return;
  if (eventType === PROOF_CLAIM_FUNNEL_EVENTS.CLAIM_STARTED) {
    rememberProofClaimAttribution();
    try {
      globalThis.window?.sessionStorage.setItem(STORAGE_KEY, '1');
    } catch {
      // Private mode / disabled storage. URL campaign still attributes.
    }
  }

  const attribution = proofClaimAttribution();
  track(eventType, {
    ...attribution,
    ...properties,
  });
  postJsonBeacon('/api/acquisition/proof-claim', {
    eventType,
    ...attribution,
    ...properties,
  });
}

export function emitProofViewedIfProofProfile(handle: string): void {
  if (!isProofProfileHandle(handle)) return;
  emitProofClaimEvent(PROOF_CLAIM_FUNNEL_EVENTS.PROOF_VIEWED, {
    profile_handle: handle,
  });
}
