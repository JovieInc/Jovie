/**
 * Canonical feedback system for Jovie.
 *
 * - `toast` — ephemeral, bottom-right action feedback (3–5s auto-dismiss,
 *   manual close, max 3 stacked). Variants: success / error / info.
 * - `banner` / `Banner` — persistent top-of-page system status and
 *   announcements, dismissed by the user.
 *
 * Both surfaces share design-system tokens and motion timing. Do not
 * import `sonner` directly anywhere in app code — this module is the
 * single seam over the underlying renderer.
 */

export { Banner, type BannerProps } from './Banner';
export { BannerViewport } from './BannerViewport';
export type {
  BannerAction,
  BannerInput,
  BannerItem,
  BannerVariant,
} from './banner-store';
export { banner } from './banner-store';
export { FeedbackProvider } from './FeedbackProvider';
export {
  getFeedbackErrorMessage,
  TOAST_DURATIONS,
  type ToastId,
  type ToastOptions,
  toast,
} from './toast';
