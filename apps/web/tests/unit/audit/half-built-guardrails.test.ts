import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import { MARKETING_TOOLS_FLYOUT_LINKS } from '@/data/marketingNavigation';
import { PRODUCT_CAPABILITIES } from '@/data/product-truth/registry';
import {
  ENTITLEMENT_REGISTRY,
  PRICING_COMPARISON,
} from '@/lib/entitlements/registry';
import { CODE_FLAGS } from '@/lib/flags/code-flags';
import { APP_FLAG_DEFAULTS } from '@/lib/flags/contracts';

const webRoot = process.cwd();

function source(relativePath: string): string {
  return readFileSync(resolve(webRoot, relativePath), 'utf8');
}

const DARK_CAPABILITIES = [
  'ab-testing',
  'developer-api',
  'email-campaigns',
  'fan-subscriptions',
  'team-management',
  'white-label',
] as const;

const DARK_CAPABILITY_PUBLIC_TERMS: Record<
  (typeof DARK_CAPABILITIES)[number],
  readonly RegExp[]
> = {
  'ab-testing': [/\ba\/b (?:optimization|testing)\b/iu],
  'developer-api': [
    /\bapi access\b/iu,
    /\bdeveloper api\b/iu,
    /\bwebhooks?\b/iu,
  ],
  'email-campaigns': [/\bemail campaigns?\b/iu],
  'fan-subscriptions': [/\bfan subscriptions?\b/iu],
  'team-management': [/\bteam management\b/iu],
  'white-label': [
    /\bremove jovie branding\b/iu,
    /\bwhite[- ]label(?:ed|ing)?\b/iu,
  ],
};

function mdxSources(relativeDirectory: string): string[] {
  const directory = resolve(webRoot, relativeDirectory);
  return readdirSync(directory, { encoding: 'utf8', recursive: true })
    .filter(path => path.endsWith('.mdx'))
    .map(path => readFileSync(resolve(directory, path), 'utf8'));
}

describe('half-built product surfaces stay dark', () => {
  it('keeps YouTube thumbnail generation off and out of navigation until certified', () => {
    expect(CODE_FLAGS.YOUTUBE_THUMBNAILS_PASTE_GENERATE).toBe(false);
    expect(MARKETING_TOOLS_FLYOUT_LINKS.map(link => link.href)).not.toContain(
      APP_ROUTES.YOUTUBE_THUMBNAILS
    );
  });

  it('keeps creator finance off and the budget route closed', () => {
    expect(APP_FLAG_DEFAULTS.CREATOR_FINANCE).toBe(false);
    const route = source('app/api/finance/budget/route.ts');
    expect(route).toContain('assertCreatorFinanceEnabled');
    expect(route).toContain("jsonError(404, 'Not found')");
  });

  it('keeps merch visual QA off while the reviewer is a stub', () => {
    expect(APP_FLAG_DEFAULTS.MERCH_QA_GATE).toBe(false);
    expect(source('lib/merch/qa-gate.ts')).toContain(
      'Visual review is not implemented yet'
    );
  });

  it('keeps proposed capabilities internal and unavailable', () => {
    for (const id of DARK_CAPABILITIES) {
      expect(PRODUCT_CAPABILITIES[id]).toMatchObject({
        maturity: 'proposed',
        publication: 'internal_only',
        access: 'unavailable',
      });
    }
  });

  it('keeps proposed capabilities out of public availability copy', () => {
    const publicAvailabilityCopy = [
      ...Object.values(ENTITLEMENT_REGISTRY).flatMap(
        plan => plan.marketing.features
      ),
      ...PRICING_COMPARISON.flatMap(category =>
        category.features.map(feature => feature.name)
      ),
      ...mdxSources('../docs/app'),
      source('components/features/home/NewFeaturesSection.tsx'),
      source('content/pages/solutions/artists.ts'),
      source('data/artistNotificationsCopy.ts'),
    ].join('\n');

    for (const id of DARK_CAPABILITIES) {
      for (const pattern of DARK_CAPABILITY_PUBLIC_TERMS[id]) {
        expect(publicAvailabilityCopy, `${id} matched ${pattern}`).not.toMatch(
          pattern
        );
      }
    }
  });
});

describe('iOS does not navigate to web-only workspaces', () => {
  it('has no manifest route for YouTube, insights, Jovie work, or release plan', () => {
    const manifest = readFileSync(
      resolve(webRoot, '../ios/Jovie/App/AppRouteManifest.swift'),
      'utf8'
    );
    const ids = [...manifest.matchAll(/id:\s*"([^"]+)"/g)].map(
      match => match[1]
    );

    expect(ids.length).toBeGreaterThan(10);
    expect(
      ids.filter(
        id =>
          !id.startsWith('webOnly.') &&
          /youtube|insights|jovie-work|joviework|release-plan|releaseplan/i.test(
            id ?? ''
          )
      )
    ).toEqual([]);
  });
});
