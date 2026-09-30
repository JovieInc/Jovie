/**
 * Official Apple product bezels (Apple Design Resources, iPhone 18 bundle).
 *
 * Policy (founder decision 2026-09-29):
 * - iPhones always use the official latest-generation iPhone Pro bezel —
 *   never a CSS-drawn phone, notch, Dynamic Island, status bar, or home
 *   indicator.
 * - The Apple Design Resources license covers mock-ups of software that runs
 *   only on Apple platforms, so the bezel frames native Jovie iOS app screens
 *   only. Mobile web captures (public profiles, smart links) render
 *   bezel-free through MobileWebScreen.
 * - Apple marketing guidelines: show the bezel as-is. No shadows,
 *   reflections, tilt, cropping, animation, cases, or recoloring; at least
 *   200px tall on screen.
 *
 * When Apple ships a new generation, replace the asset and geometry here —
 * this is the only file that knows the device.
 */
export const OFFICIAL_IPHONE_BEZEL = {
  model: 'iPhone 18 Pro',
  finish: 'Black',
  src: '/device-bezels/iphone-18-pro-black-portrait.png',
  width: 1350,
  height: 2760,
  /** Transparent screen opening inside the bezel PNG, in source pixels. */
  screen: { x: 72, y: 69, width: 1206, height: 2622 },
  /** Apple guideline minimum on-screen height. */
  minRenderedHeightPx: 200,
} as const;
