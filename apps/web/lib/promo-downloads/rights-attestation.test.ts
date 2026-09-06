import { describe, expect, it } from 'vitest';
import {
  isPromoDownloadAvailable,
  PROMO_DOWNLOAD_RIGHTS_ATTESTATION_LABEL,
} from './rights-attestation';

describe('promo download rights attestation', () => {
  it('keeps the dashboard attestation explicit', () => {
    expect(PROMO_DOWNLOAD_RIGHTS_ATTESTATION_LABEL).toContain('control 100%');
    expect(PROMO_DOWNLOAD_RIGHTS_ATTESTATION_LABEL).toContain('right to give');
  });

  it.each([
    ['inactive', { isActive: false, rightsControlAttested: true, isPro: true }],
    [
      'not attested',
      { isActive: true, rightsControlAttested: false, isPro: true },
    ],
    ['non-Pro', { isActive: true, rightsControlAttested: true, isPro: false }],
    ['missing', undefined],
  ])('blocks %s promo downloads', (_reason, download) => {
    expect(isPromoDownloadAvailable(download)).toBe(false);
  });

  it('allows active rights-attested Pro promo downloads', () => {
    expect(
      isPromoDownloadAvailable({
        isActive: true,
        rightsControlAttested: true,
        isPro: true,
      })
    ).toBe(true);
  });
});
