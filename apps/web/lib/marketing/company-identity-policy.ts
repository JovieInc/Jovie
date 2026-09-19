/**
 * Route-scope identity policy for JOV-6261, against JOV-6216 publication
 * contract and JOV-6223 product-truth invariants.
 *
 * General company definition cannot be artist-only. Labeled music examples and
 * specialist artist-API limitations remain exact. This is not a global
 * artist-word ban and does not own nav taxonomy (JOV-4491).
 */

export const IDENTITY_SURFACE_SCOPES = [
  'general',
  'artist-labeled',
  'specialist-api',
  'founder-biography',
] as const;

export type IdentitySurfaceScope = (typeof IDENTITY_SURFACE_SCOPES)[number];

export interface IdentitySurface {
  readonly id: string;
  readonly scope: IdentitySurfaceScope;
  readonly path: string;
}

export const GENERAL_IDENTITY_SURFACES = [
  { id: 'root-layout', scope: 'general', path: 'app/layout.tsx' },
  { id: 'company-identity', scope: 'general', path: 'data/companyIdentity.ts' },
  { id: 'about-copy', scope: 'general', path: 'data/aboutCopy.ts' },
  {
    id: 'about-route',
    scope: 'general',
    path: 'app/(marketing)/about/page.tsx',
  },
  {
    id: 'about-body',
    scope: 'general',
    path: 'components/organisms/AboutPageContent.tsx',
  },
  { id: 'llms-txt', scope: 'general', path: 'app/llms.txt/route.ts' },
  { id: 'llms-full', scope: 'general', path: 'app/llms-full.txt/route.ts' },
  { id: 'manifest', scope: 'general', path: 'app/manifest.ts' },
  {
    id: 'signup-metadata',
    scope: 'general',
    path: 'app/(auth)/signup/layout.tsx',
  },
  {
    id: 'auth-brand-defaults',
    scope: 'general',
    path: 'components/features/auth/AuthBrandPanel.tsx',
  },
  {
    id: 'organization-schema',
    scope: 'general',
    path: 'lib/constants/schemas.ts',
  },
  { id: 'brand-metadata', scope: 'general', path: 'app/brand/page.tsx' },
] as const satisfies readonly IdentitySurface[];

export const ARTIST_LABELED_IDENTITY_SURFACES = [
  {
    id: 'artist-profiles',
    scope: 'artist-labeled',
    path: 'app/(marketing)/artist-profiles/page.tsx',
  },
  {
    id: 'artist-notifications',
    scope: 'artist-labeled',
    path: 'app/(marketing)/artist-notifications/page.tsx',
  },
] as const satisfies readonly IdentitySurface[];

export const SPECIALIST_API_IDENTITY_SURFACES = [
  {
    id: 'public-artist-api-guidance',
    scope: 'specialist-api',
    path: 'lib/agent/site-llms-guidance.ts',
  },
  {
    id: 'developers',
    scope: 'specialist-api',
    path: 'app/(marketing)/developers/page.tsx',
  },
] as const satisfies readonly IdentitySurface[];

const ARTIST_ONLY_COMPANY_DEFINITION_PATTERNS = [
  /release platform for independent musicians/i,
  /release platform for independent artists/i,
  /built specifically for (?:independent )?music(?:ians| artists)/i,
  /built specifically for musicians/i,
  /one link to launch your music career/i,
  /closed-loop operating system for music artists/i,
  /vertical operating system for music artists/i,
  /conversion-first release platform built specifically for independent music artists/i,
  /artist profiles for music artists/i,
  /(?:^|\n)built for artists\.?(?:\n|$)/i,
  /launch your artist profile, share smarter music links/i,
] as const;

const ARTIST_SCOPE_LABEL =
  /(?:^|\n|:\s*)(?:for artists\b|artists solution\b|public artist api\b|artist-only\b|labeled artists\b)/i;

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map(sentence => sentence.trim())
    .filter(Boolean);
}

export function isArtistOnlyCompanyDefinition(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) return false;

  const sentences = splitSentences(normalized);
  const candidates = sentences.length > 0 ? sentences : [normalized];

  return candidates.some(sentence => {
    const matchesExclusive = ARTIST_ONLY_COMPANY_DEFINITION_PATTERNS.some(
      pattern => pattern.test(sentence)
    );
    if (!matchesExclusive) return false;
    if (ARTIST_SCOPE_LABEL.test(sentence)) return false;
    if (/public artist api/i.test(sentence)) return false;
    return true;
  });
}

export function requiresSpotifyCatalogOrFollowers(text: string): boolean {
  return (
    /must (?:have|connect) (?:a )?spotify/i.test(text) ||
    /spotify account (?:is )?required/i.test(text) ||
    /minimum (?:of )?\d+ followers/i.test(text) ||
    /catalog (?:is )?required to (?:start|sign up|create a profile)/i.test(text)
  );
}

export function extractCompanyIdentityBlock(text: string): string {
  const cutoff = text.search(
    /\n## (?:Artist workflows|When to use |Product Features|Public API)\b/i
  );
  return cutoff === -1 ? text : text.slice(0, cutoff);
}
