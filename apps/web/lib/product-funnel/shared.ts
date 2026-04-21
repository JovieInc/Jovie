export const PRODUCT_FUNNEL_CLIENT_EVENT_TYPES = [
  'visit',
  'signup_started',
  'onboarding_started',
  'app_session',
] as const;

export const PRODUCT_FUNNEL_STAGE_ORDER = [
  'visit',
  'signup_started',
  'signup_completed',
  'email_verified',
  'onboarding_started',
  'onboarding_completed',
  'activated',
  'checkout_started',
  'payment_succeeded',
  'retained_day_1',
  'retained_day_7',
] as const;

export const PRODUCT_FUNNEL_HELPER_EVENT_TYPES = ['app_session'] as const;

export const PRODUCT_FUNNEL_EVENT_TYPES = [
  ...PRODUCT_FUNNEL_STAGE_ORDER,
  ...PRODUCT_FUNNEL_HELPER_EVENT_TYPES,
] as const;

export type ProductFunnelClientEventType =
  (typeof PRODUCT_FUNNEL_CLIENT_EVENT_TYPES)[number];
export type ProductFunnelStageType =
  (typeof PRODUCT_FUNNEL_STAGE_ORDER)[number];
export type ProductFunnelEventType =
  (typeof PRODUCT_FUNNEL_EVENT_TYPES)[number];

export function isProductFunnelClientEventType(
  value: string
): value is ProductFunnelClientEventType {
  return PRODUCT_FUNNEL_CLIENT_EVENT_TYPES.includes(
    value as ProductFunnelClientEventType
  );
}

export function isProductFunnelEventType(
  value: string
): value is ProductFunnelEventType {
  return PRODUCT_FUNNEL_EVENT_TYPES.includes(value as ProductFunnelEventType);
}
