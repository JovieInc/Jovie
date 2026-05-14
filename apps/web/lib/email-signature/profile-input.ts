/**
 * Adapter helpers that turn the various profile shapes used in the dashboard
 * into the `EmailSignatureInput` accepted by `buildEmailSignature`.
 *
 * Kept separate from the pure signature builder so the builder stays
 * dependency-free and easy to test.
 */

import type {
  EmailSignatureInput,
  EmailSignatureSocial,
} from './build-signature';

interface ProfileLikeForSignature {
  readonly username: string;
  readonly displayName?: string | null;
  readonly avatarUrl?: string | null;
  readonly genres?: readonly string[] | null;
  readonly location?: string | null;
}

interface SocialLinkLike {
  readonly label: string;
  readonly url: string;
}

function buildTagline(profile: ProfileLikeForSignature): string | undefined {
  const segments: string[] = [];
  const firstGenre = profile.genres?.find(g => g.trim().length > 0)?.trim();
  if (firstGenre) {
    segments.push(firstGenre);
  }
  const location = profile.location?.trim();
  if (location) {
    segments.push(location);
  }
  return segments.length ? segments.join(' • ') : undefined;
}

function dedupeSocials(
  socials: ReadonlyArray<SocialLinkLike>
): EmailSignatureSocial[] {
  const seen = new Set<string>();
  const result: EmailSignatureSocial[] = [];
  for (const social of socials) {
    const url = social.url.trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    result.push({ label: social.label.trim() || url, url });
  }
  return result;
}

export interface BuildSignatureInputFromProfileOptions {
  readonly profile: ProfileLikeForSignature;
  readonly socials?: ReadonlyArray<SocialLinkLike>;
  readonly hideJovieBranding?: boolean;
}

/**
 * Build the structured signature input from a profile + optional socials.
 * Returns `null` when there isn't enough data to render a useful signature
 * (no username/handle).
 */
export function buildSignatureInputFromProfile({
  profile,
  socials,
  hideJovieBranding,
}: BuildSignatureInputFromProfileOptions): EmailSignatureInput | null {
  const handle = profile.username.trim();
  if (!handle) return null;
  const name = (profile.displayName?.trim() || handle).trim();
  return {
    name,
    handle,
    tagline: buildTagline(profile),
    avatarUrl: profile.avatarUrl ?? null,
    socials: socials ? dedupeSocials(socials) : undefined,
    hideJovieBranding,
  };
}
