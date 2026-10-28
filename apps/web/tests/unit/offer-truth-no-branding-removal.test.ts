// @vitest-environment node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Tim, 2026-10-25: Jovie branding stays on every profile, including Pro.
 * No customer-facing copy or capability doc may promise removing, hiding or
 * restoring it, or sell "white-label".
 */
const repo = path.join(__dirname, '../../../..');
const FILES = [
  'apps/web/lib/billing/offer-truth.ts',
  'apps/web/data/product-truth/golden-path-claims.ts',
  'apps/web/data/product-truth/golden-path-proof.gen.json',
  'apps/web/data/marketing/renderedCopyCoverage.ts',
  'apps/web/lib/email/templates/payment-recovered.ts',
  'apps/web/lib/email/templates/payment-failed.ts',
  'apps/web/lib/email/templates/subscription-confirmed.ts',
  'apps/web/components/organisms/billing/BillingActionsSection.tsx',
  'apps/web/app/billing/success/page.tsx',
  'apps/web/app/onboarding/checkout/page.tsx',
  'apps/web/app/(marketing)/pricing/page.tsx',
  'apps/web/lib/billing/README.md',
  'docs/PRODUCT_CAPABILITIES.md',
  'docs/FEATURE_REGISTRY.md',
  'docs/company/PRICING-PHILOSOPHY.md',
  'docs/artist-profile-features.md',
];
const PROMISES = [
  /branding\s+(removed|removal)/i,
  /remov(e|es|ing)\s+(the\s+)?(jovie\s+)?branding/i,
  /(restore|restores|restored)\s+(the\s+)?(jovie\s+|profile\s+)?branding/i,
  /branding\s+will\s+(be\s+restored|reappear|return)/i,
  /white-?label/i,
  /powered by jovie.*remov/i,
];

describe('offer truth: no promise to remove Jovie branding', () => {
  for (const file of FILES) {
    it(file, () => {
      let text: string;
      try {
        text = readFileSync(path.join(repo, file), 'utf8');
      } catch {
        return; // file not present on this branch
      }
      for (const promise of PROMISES) {
        const hit = text.match(promise);
        // The documented decision itself may mention that no removal exists.
        if (
          hit &&
          !/no branding-removal feature/i.test(
            text.slice(
              Math.max(0, (hit.index ?? 0) - 120),
              (hit.index ?? 0) + 120
            )
          )
        ) {
          expect.fail(`${file} promises branding removal: "${hit[0]}"`);
        }
      }
    });
  }
});
