/**
 * Shared capture contract for Jovie video.
 *
 * Inputs differ by platform (Mac screen, iOS camera, file pick).
 * Import is one path: account video URL + purpose. Surfaces (Ovie walk,
 * teleprompter, later user screen record) must not invent a second store.
 */
export const CAPTURE_INPUTS = ['screen', 'camera', 'file'] as const;
export type CaptureInput = (typeof CAPTURE_INPUTS)[number];

export const CAPTURE_PURPOSES = [
  'founder_walk',
  'promo',
  'thank_you',
  'bts',
  'screen',
] as const;
export type CapturePurpose = (typeof CAPTURE_PURPOSES)[number];

export interface AccountVideoUpload {
  readonly url: string;
  readonly fileName: string;
  readonly byteSize: number;
}
