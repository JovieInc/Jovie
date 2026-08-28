import { APP_ROUTES } from '@/constants/routes';
import { TIM_WHITE_PROFILE } from '@/lib/tim-white';

export const HOMEPAGE_ROLE_INVARIANT_ISSUE_ID = 'JOV-5386' as const;

export const HOMEPAGE_SHIPPING_LAYERS = [
  'source',
  'ci',
  'exact-main',
  'deployment',
  'public-runtime',
] as const;

export type HomepageShippingLayer = (typeof HOMEPAGE_SHIPPING_LAYERS)[number];

export const HOMEPAGE_UNLOCKED_SECTION_MOUNTS = [
  'HomepageMeetJovie',
  'HomepageArtistProfiles',
  'HomepageClosedLoop',
  'HomepageFaq',
] as const;

export const HOMEPAGE_STORY_STACK_MOUNTS = [
  'HomepageUnlockedSections',
  'HomepageV2FinalCta',
] as const;

export const HOMEPAGE_ROOT_MOUNTS = [
  'HomepageHero',
  'HomepageStoryStack',
] as const;

export const HOMEPAGE_FORBIDDEN_ARTIST_STORY_TOKENS = [
  'MarketingShippedSitesShowcase',
  'MarketingPlatformSpecBento',
  'homepage-shipped-sites-showcase',
  'homepage-platform-spec-bento',
  'm-shipped-sites',
  'm-spec-bento',
  'Live Artist Sites',
  'The Artist Platform',
] as const;

export const HOMEPAGE_FORBIDDEN_ACCENT_CARD_TOKENS = [
  'm-spec-bento__title--blue',
  'm-spec-bento__title--pink',
  'm-spec-bento__title--purple',
  "data-accent='blue'",
  "data-accent='pink'",
  "data-accent='purple'",
  'data-accent="blue"',
  'data-accent="pink"',
  'data-accent="purple"',
] as const;

export const HOMEPAGE_ALLOWED_PUBLIC_DESTINATIONS = [
  APP_ROUTES.START,
  APP_ROUTES.ARTIST_PROFILES,
  APP_ROUTES.SIGNIN,
  TIM_WHITE_PROFILE.publicProfilePath,
] as const;

export interface HomepageRoleFinding {
  readonly code: string;
  readonly message: string;
  readonly layer?: HomepageShippingLayer;
}

export interface HomepagePublicProofTile {
  readonly id: string;
  readonly name: string;
  readonly handle: string;
  readonly href?: string;
  readonly scenarioId: string;
  readonly label: string;
}

export interface HomepageShippingLayerClaim {
  readonly provenLayer: HomepageShippingLayer;
  readonly assertedLayer: HomepageShippingLayer;
}

const LAYER_RANK: Record<HomepageShippingLayer, number> = {
  source: 0,
  ci: 1,
  'exact-main': 2,
  deployment: 3,
  'public-runtime': 4,
};

const DEMO_DESTINATION_PATTERN = /^\/demo(?:\/|\?|#|$)/;
const START_DESTINATION_PATTERN = /^\/start(?:\?|#|$)/;
const HASH_DESTINATION_PATTERN = /^#/;

function pushFinding(
  findings: HomepageRoleFinding[],
  code: string,
  message: string,
  layer?: HomepageShippingLayer
) {
  findings.push(layer ? { code, message, layer } : { code, message });
}

function extractFunctionBody(source: string, functionName: string): string {
  const needle = `function ${functionName}(`;
  const start = source.indexOf(needle);
  if (start < 0) return '';

  const nextFn = source.indexOf('\nfunction ', start + needle.length);
  return nextFn > start ? source.slice(start, nextFn) : source.slice(start);
}

export function readJsxComponentMounts(source: string): readonly string[] {
  return [...source.matchAll(/<([A-Z][A-Za-z0-9]*)\b/g)].map(match => match[1]);
}

export function readHomepageUnlockedSectionMounts(
  pageSource: string
): readonly string[] {
  return readJsxComponentMounts(
    extractFunctionBody(pageSource, 'HomepageUnlockedSections')
  );
}

export function readHomepageStoryStackMounts(
  pageSource: string
): readonly string[] {
  return readJsxComponentMounts(
    extractFunctionBody(pageSource, 'HomepageStoryStack')
  );
}

export function presenceOnlyHomepageMountsPass(
  pageSource: string,
  requiredMounts: readonly string[]
): boolean {
  return requiredMounts.every(mount => pageSource.includes(mount));
}

function isAllowedPublicDestination(href: string): boolean {
  if (
    HASH_DESTINATION_PATTERN.test(href) ||
    START_DESTINATION_PATTERN.test(href)
  ) {
    return true;
  }

  return (HOMEPAGE_ALLOWED_PUBLIC_DESTINATIONS as readonly string[]).includes(
    href
  );
}

export function auditHomepageRootComposition(
  pageSource: string
): readonly HomepageRoleFinding[] {
  const findings: HomepageRoleFinding[] = [];
  const unlockedMounts = readHomepageUnlockedSectionMounts(pageSource);
  const storyStackMounts = readHomepageStoryStackMounts(pageSource);

  if (unlockedMounts.join('|') !== HOMEPAGE_UNLOCKED_SECTION_MOUNTS.join('|')) {
    pushFinding(
      findings,
      'homepage-unlocked-section-order',
      `Live \`/\` unlocked sections must be ${HOMEPAGE_UNLOCKED_SECTION_MOUNTS.join(
        ' → '
      )}; found ${unlockedMounts.join(' → ') || '(missing)'}.`,
      'source'
    );
  }

  if (storyStackMounts.join('|') !== HOMEPAGE_STORY_STACK_MOUNTS.join('|')) {
    pushFinding(
      findings,
      'homepage-story-stack-order',
      `Live \`/\` story stack must be ${HOMEPAGE_STORY_STACK_MOUNTS.join(
        ' → '
      )}; found ${storyStackMounts.join(' → ') || '(missing)'}.`,
      'source'
    );
  }

  for (const token of HOMEPAGE_FORBIDDEN_ARTIST_STORY_TOKENS) {
    if (pageSource.includes(token)) {
      pushFinding(
        findings,
        'homepage-artist-profile-story',
        `Live \`/\` is the umbrella Jovie homepage and must not mount artist-profile-story token \`${token}\`.`,
        'source'
      );
    }
  }

  for (const token of HOMEPAGE_FORBIDDEN_ACCENT_CARD_TOKENS) {
    if (pageSource.includes(token)) {
      pushFinding(
        findings,
        'homepage-decorative-accent-card',
        `Live \`/\` must not use decorative accent/card token \`${token}\`.`,
        'source'
      );
    }
  }

  return findings;
}

export function auditHomepagePublicProof(
  tiles: readonly HomepagePublicProofTile[]
): readonly HomepageRoleFinding[] {
  const findings: HomepageRoleFinding[] = [];
  const identityCounts = new Map<string, number>();

  for (const tile of tiles) {
    const href = tile.href?.trim() ?? '';
    const identity = `${tile.name}|${tile.handle}`;
    identityCounts.set(identity, (identityCounts.get(identity) ?? 0) + 1);

    if (!href) {
      pushFinding(
        findings,
        'homepage-proof-missing-destination',
        `Proof tile \`${tile.id}\` claims a shipped public destination but has no href.`,
        'source'
      );
      continue;
    }

    if (
      DEMO_DESTINATION_PATTERN.test(href) ||
      href.includes('/demo/showcase/')
    ) {
      pushFinding(
        findings,
        'homepage-demo-capture-as-shipped-profile',
        `Proof tile \`${tile.id}\` presents demo capture \`${href}\` as a shipped public profile.`,
        'source'
      );
    }

    if (!isAllowedPublicDestination(href)) {
      pushFinding(
        findings,
        'homepage-claimed-destination-not-public',
        `Proof tile \`${tile.id}\` claims public destination \`${href}\` which is not a verified live public route.`,
        'source'
      );
    }
  }

  for (const [identity, count] of identityCounts) {
    if (count > 1) {
      pushFinding(
        findings,
        'homepage-duplicate-shipped-profile',
        `Public proof presents ${count} demo captures as distinct shipped profiles for \`${identity}\`.`,
        'source'
      );
    }
  }

  return findings;
}

export function auditHomepageRouteIntegrity(
  combinedHomepageSource: string
): readonly HomepageRoleFinding[] {
  const findings: HomepageRoleFinding[] = [];
  const hrefs = [
    ...combinedHomepageSource.matchAll(/\bhref=\{?['"]([^'"]+)['"]\}?/g),
  ].map(match => match[1]);

  for (const href of hrefs) {
    if (DEMO_DESTINATION_PATTERN.test(href)) {
      pushFinding(
        findings,
        'homepage-demo-capture-as-shipped-profile',
        `Live homepage source claims demo destination \`${href}\` as a public route.`,
        'source'
      );
    }
  }

  return findings;
}

export function auditHomepageShippingLayerClaim(
  claim: HomepageShippingLayerClaim
): readonly HomepageRoleFinding[] {
  if (LAYER_RANK[claim.assertedLayer] > LAYER_RANK[claim.provenLayer]) {
    return [
      {
        code: 'homepage-shipping-layer-overclaim',
        message: `A ${claim.provenLayer} receipt cannot prove ${claim.assertedLayer}. Verify source, CI, exact main, deployment, and public runtime separately.`,
        layer: claim.provenLayer,
      },
    ];
  }

  return [];
}

export function auditHomepageRoleInvariants({
  pageSource,
  combinedHomepageSource = pageSource,
  proofTiles = [],
  shippingClaim,
}: {
  readonly pageSource: string;
  readonly combinedHomepageSource?: string;
  readonly proofTiles?: readonly HomepagePublicProofTile[];
  readonly shippingClaim?: HomepageShippingLayerClaim;
}): readonly HomepageRoleFinding[] {
  return [
    ...auditHomepageRootComposition(pageSource),
    ...auditHomepagePublicProof(proofTiles),
    ...auditHomepageRouteIntegrity(combinedHomepageSource),
    ...(shippingClaim ? auditHomepageShippingLayerClaim(shippingClaim) : []),
  ];
}
