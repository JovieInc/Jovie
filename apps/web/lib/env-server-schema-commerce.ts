import 'server-only';
import { z } from 'zod';

/** Printful and Stripe price-ID keys, merged into ServerEnvSchema. */
export const commerceServerEnvSchema = z.object({
  // Printful fulfillment backend
  PRINTFUL_API_KEY: z.string().optional(),
  PRINTFUL_API_BASE_URL: z.string().url().optional(),
  PRINTFUL_STORE_ID: z.string().optional(),
  PRINTFUL_WEBHOOK_SECRET: z.string().optional(),

  // Retired founding tier — webhook lookup only (founding -> pro entitlements)
  STRIPE_PRICE_FOUNDING_MONTHLY: z.string().startsWith('price_').optional(),

  // Stripe price IDs for Pro tier (amounts in lib/config/plan-prices.ts)
  STRIPE_PRICE_ARTIST_VISIBILITY_PRO_MONTHLY: z
    .string()
    .startsWith('price_')
    .optional(),
  STRIPE_PRICE_PRO_MONTHLY: z.string().startsWith('price_').optional(),
  STRIPE_PRICE_PRO_ANNUAL: z.string().startsWith('price_').optional(),
  STRIPE_PRICE_PRO_YEARLY: z.string().startsWith('price_').optional(),

  // Product-specific founder offer. Maps to Pro base entitlements while the
  // exact price ID remains the YouTube thumbnail entitlement source of truth.
  STRIPE_PRICE_YOUTUBE_THUMBNAILS_FOUNDER_MONTHLY: z
    .string()
    .startsWith('price_')
    .optional(),

  // Stripe price IDs for Growth tier (legacy, kept for backward compat)
  STRIPE_PRICE_GROWTH_MONTHLY: z.string().startsWith('price_').optional(),
  STRIPE_PRICE_GROWTH_YEARLY: z.string().startsWith('price_').optional(),

  // Stripe price IDs for Max tier (amounts in lib/config/plan-prices.ts)
  STRIPE_PRICE_MAX_MONTHLY: z.string().startsWith('price_').optional(),
  STRIPE_PRICE_MAX_YEARLY: z.string().startsWith('price_').optional(),
});
