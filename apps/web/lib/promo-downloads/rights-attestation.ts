export const PROMO_DOWNLOAD_RIGHTS_ATTESTATION_LABEL =
  'I attest that I control 100% of this recording and have the right to give this file away. An email address is not a rights grant.';

export const PROMO_DOWNLOAD_RIGHTS_REQUIRED_ERROR =
  'Confirm that you control the recording and may give this file away.';

export const PROMO_DOWNLOAD_RIGHTS_ACTIVATION_ERROR =
  'Confirm full recording control before making this download active.';

export interface PromoDownloadAvailability {
  readonly isActive: boolean | null;
  readonly rightsControlAttested: boolean | null;
  readonly isPro: boolean | null;
}

export function isPromoDownloadAvailable<T extends PromoDownloadAvailability>(
  download: T | null | undefined
): download is T & {
  readonly isActive: true;
  readonly rightsControlAttested: true;
  readonly isPro: true;
} {
  return (
    download?.isActive === true &&
    download.rightsControlAttested === true &&
    download.isPro === true
  );
}
