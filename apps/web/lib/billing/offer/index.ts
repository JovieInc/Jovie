import { allClaims } from './claims';
import { contentHash } from './hash';
import { OFFER } from './offer';

export * from './claims';
export { contentHash } from './hash';
export { OFFER, type Offer } from './offer';

/** Hash of the offer facts AND every rendered claim, so a wording change also drifts. */
export function offerHash(): string {
  return contentHash({ offer: OFFER, claims: allClaims() });
}

/** The public, cacheable wire shape served at /api/offer and read by the live check. */
export function offerSnapshot() {
  return {
    version: OFFER.version,
    hash: offerHash(),
    offer: OFFER,
    claims: allClaims(),
  } as const;
}
