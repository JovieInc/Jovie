import type { VisitorSignals } from './engine';

/**
 * Server-side decode of the profile ISR variant key produced by the edge
 * rewrites in `lib/routing/profile-variant-rewrites.js`.
 *
 * The variant carries only coarse request signals (arrived from a streaming
 * service, edge country, consented returning marker). Device and in-app
 * browser are not edge signals and are reported as unknown.
 */

/** Must equal PROFILE_VARIANT_MARKER in profile-variant-rewrites.js (tested). */
export const PROFILE_VARIANT_MARKER = '__profile-variant';

export interface ProfileVariantSeed {
  readonly dsp: boolean;
  readonly returning: boolean;
  readonly country: string | null;
}

const KEY_PATTERN = /^([do])([rn])-([A-Z]{2}|xx)$/u;

export function parseProfileVariantKey(key: string): ProfileVariantSeed | null {
  const match = KEY_PATTERN.exec(key);
  if (!match) return null;
  const country = match[3] === 'xx' ? null : (match[3] ?? null);
  return { dsp: match[1] === 'd', returning: match[2] === 'r', country };
}

export function encodeProfileVariantKey(seed: ProfileVariantSeed): string {
  return `${seed.dsp ? 'd' : 'o'}${seed.returning ? 'r' : 'n'}-${seed.country ?? 'xx'}`;
}

/** Signals for a render: the seed's request signals plus the render clock. */
export function signalsFromVariantSeed(
  seed: ProfileVariantSeed | null,
  now: Date
): VisitorSignals {
  if (!seed) {
    return {
      source: { channel: 'direct', name: null },
      inApp: null,
      country: null,
      device: 'unknown',
      returning: null,
      now,
    };
  }
  return {
    source: seed.dsp
      ? { channel: 'dsp', name: null }
      : { channel: 'other', name: null },
    inApp: null,
    country: seed.country,
    device: 'unknown',
    returning: seed.returning ? true : null,
    now,
  };
}

/**
 * Markets that get their own variant. Must equal VARIANT_COUNTRIES in
 * profile-variant-rewrites.js (tested), which owns the edge side.
 */
export const VARIANT_COUNTRIES = [
  'US',
  'GB',
  'DE',
  'FR',
  'CA',
  'AU',
  'BR',
  'MX',
  'JP',
  'NL',
  'SE',
  'ES',
  'IT',
] as const;

/** Every variant key the edge can produce (the bounded set, 56 keys). */
export function allProfileVariantKeys(): string[] {
  const keys: string[] = [];
  for (const dsp of [true, false])
    for (const returning of [true, false])
      for (const country of [null, ...VARIANT_COUNTRIES])
        keys.push(encodeProfileVariantKey({ dsp, returning, country }));
  return keys;
}

/** Internal paths of every variant render for a profile, for invalidation. */
export function profileVariantPaths(usernameNormalized: string): string[] {
  return allProfileVariantKeys().map(
    key =>
      `/${usernameNormalized}/profile-variant-render/${key}/${PROFILE_VARIANT_MARKER}`
  );
}
