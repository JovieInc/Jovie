/**
 * Shared onboarding stage frame recipes.
 *
 * Framed and v1 keep distinct fills, seams, and shadows. Radius and padding
 * for the raised stage live here so those variants cannot drift apart.
 */
export const ONBOARDING_STAGE_FRAME_GEOMETRY_CLASS =
  'rounded-3xl px-5 py-6 sm:px-8';

export const ONBOARDING_STAGE_FLAT_CLASS = 'px-0 py-2 sm:px-0 sm:py-3';

export const ONBOARDING_STAGE_FRAMED_SURFACE_CLASS =
  'border border-(--linear-app-frame-seam) bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))] shadow-[0_24px_60px_rgba(0,0,0,0.18)] sm:py-8';

export const ONBOARDING_STAGE_V1_SURFACE_CLASS =
  'border border-white/[0.07] bg-(--color-bg-surface-0)/72 shadow-[0_28px_100px_rgba(0,0,0,0.34)]';
