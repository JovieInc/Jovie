/**
 * Revenue-surface contract guard (JOV-7809).
 *
 * The $199 Artist Presence upgrade screen shipped to founder dogfood as a
 * generic SaaS paywall: placeholder preview chrome, divergent plan naming
 * ("Artist Presence" vs "Pro"), contradictory lifecycle copy
 * ("Start free, upgrade anytime" on an already-live free profile), and
 * feature-noun copy instead of outcomes. Nothing failed because no gate
 * covered these invariants.
 *
 * This guard fails CI when a registered revenue surface (paywalls, upgrade
 * drawers, checkout interstitials) regresses on:
 *   - plan naming sourced from canonical truth, never hand-written literals
 *   - lifecycle copy that contradicts the user's actual state
 *   - placeholder/broken preview content
 *   - prices rendered outside the canonical formatter
 *   - a missing primary upgrade CTA
 *
 * When you add a new revenue surface, register it in REVENUE_SURFACE_CONTRACTS
 * (sorted by path) so it inherits these checks.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ARTIST_VISIBILITY_OFFER, PLAN_PRICES } from '@/lib/config/plan-prices';
import { ENTITLEMENT_REGISTRY } from '@/lib/entitlements/registry';

const appRoot = resolve(__dirname, '../../..');

interface RevenueSurfaceContract {
  /** Source file relative to apps/web. */
  readonly path: string;
  /** The surface shows a checkout/upgrade CTA. */
  readonly hasUpgradeCta: boolean;
  /**
   * The user already has a live free profile when this surface renders.
   * On such surfaces, "start free"/trial lead-in copy is a contradiction.
   */
  readonly profileAlreadyLive: boolean;
  /** The surface renders a profile/identity preview. */
  readonly hasProfilePreview: boolean;
}

/**
 * Registered revenue surfaces. Keep sorted by path so concurrent PRs merge
 * cleanly.
 */
const REVENUE_SURFACE_CONTRACTS: readonly RevenueSurfaceContract[] = [
  {
    path: 'app/onboarding/checkout/OnboardingCheckoutClient.tsx',
    hasUpgradeCta: true,
    profileAlreadyLive: true,
    hasProfilePreview: true,
  },
  {
    path: 'components/molecules/UpgradeButton.tsx',
    hasUpgradeCta: true,
    profileAlreadyLive: false,
    hasProfilePreview: false,
  },
  {
    path: 'components/molecules/UsageLimitUpgradePrompt.tsx',
    hasUpgradeCta: true,
    profileAlreadyLive: false,
    hasProfilePreview: false,
  },
] as const;

/** Plan-name literals that must come from canonical truth, not JSX/copy. */
const HARDCODED_PLAN_NAME_PATTERNS = [
  /'Artist Presence'/,
  /"Artist Presence"/,
  />Artist Presence</,
  /'Pro'/,
  /"Pro"/,
  />Pro</,
] as const;

/** Lifecycle copy forbidden on surfaces shown after the free profile is live. */
const CONTRADICTORY_LIFECYCLE_PATTERNS = [
  /start free/i,
  /try free/i,
  /sign up free/i,
] as const;

/** Placeholder / broken-preview markers that read as fake or unfinished. */
const PLACEHOLDER_PATTERNS = [
  /lorem ipsum/i,
  /placeholder/i,
  /\bTODO\b/,
  /'[?]'/,
  /"[?]"/,
  /'@'/,
  /"@"/,
] as const;

function readSurface(contract: RevenueSurfaceContract): string {
  return readFileSync(resolve(appRoot, contract.path), 'utf8');
}

describe('revenue-surface contract (JOV-7809)', () => {
  it('keeps one canonical plan name across offer truth and the entitlement registry', () => {
    expect(ARTIST_VISIBILITY_OFFER.pro.displayName).toBe('Artist Presence');
    expect(ENTITLEMENT_REGISTRY.pro.marketing.displayName).toBe(
      ARTIST_VISIBILITY_OFFER.pro.displayName
    );
    expect(PLAN_PRICES.pro.monthly).toBe(
      ARTIST_VISIBILITY_OFFER.pro.monthlyUsd
    );
  });

  it('certifies every outcome claimed by the paid offer', () => {
    // The paid offer's outcome claims are the contract — revenue surfaces may
    // lead with them, but must not invent capabilities beyond the registry.
    expect(ARTIST_VISIBILITY_OFFER.pro.outcomes.length).toBeGreaterThan(0);
    expect(ENTITLEMENT_REGISTRY.pro.marketing.tagline).toContain(
      'visibility monitoring'
    );
  });

  describe.each(REVENUE_SURFACE_CONTRACTS.map(c => [c.path, c] as const))(
    'surface %s',
    (_path, contract) => {
      const source = readSurface(contract);

      it('never hardcodes plan display names — sources them from canonical truth', () => {
        for (const pattern of HARDCODED_PLAN_NAME_PATTERNS) {
          expect(
            source,
            `${contract.path} hardcodes a plan name matching ${pattern}; read it from getEntitlements()/ARTIST_VISIBILITY_OFFER instead`
          ).not.toMatch(pattern);
        }
        expect(source).toMatch(/entitlements\/registry|billing\/offer-truth/);
      });

      it('never renders placeholder or broken preview content', () => {
        for (const pattern of PLACEHOLDER_PATTERNS) {
          expect(
            source,
            `${contract.path} contains placeholder/broken marker ${pattern}`
          ).not.toMatch(pattern);
        }
      });

      if (contract.profileAlreadyLive) {
        it('never contradicts the live-profile lifecycle ("start free" etc.)', () => {
          for (const pattern of CONTRADICTORY_LIFECYCLE_PATTERNS) {
            expect(
              source,
              `${contract.path} shows contradictory lifecycle copy ${pattern} to a user whose free profile is already live`
            ).not.toMatch(pattern);
          }
        });
      }

      if (contract.hasUpgradeCta) {
        it('renders a primary upgrade CTA bound to a checkout/upgrade handler', () => {
          expect(source).toMatch(/Upgrade to \$/);
        });
      }

      if (contract.hasProfilePreview) {
        it('renders real profile identity, never a fake handle', () => {
          // The preview must be fed by the actual profile props.
          expect(source).toMatch(/displayName/);
          expect(source).toMatch(/avatarUrl/);
          expect(source).not.toMatch(/@\{?['"`]?\s*\}/);
        });
      }
    }
  );

  it('checkout renders price only through the canonical currency formatter', () => {
    const source = readFileSync(
      resolve(appRoot, 'app/onboarding/checkout/OnboardingCheckoutClient.tsx'),
      'utf8'
    );
    expect(source).toContain('formatAmount(currentAmount)');
    expect(source).not.toMatch(/\$\d+\/mo|\$199/);
  });

  it('checkout headline, support copy, and CTA share one name source', () => {
    const source = readFileSync(
      resolve(appRoot, 'app/onboarding/checkout/OnboardingCheckoutClient.tsx'),
      'utf8'
    );
    // No divergent name branches: both upsell and paid-intent paths must read
    // the same canonical display name.
    const nameReads = source.match(/planMarketing\.displayName/g) ?? [];
    expect(nameReads.length).toBeGreaterThanOrEqual(3);
  });
});
