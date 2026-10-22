import { notFound } from 'next/navigation';
import ArtistPage, {
  generateMetadata as generatePublicProfileMetadata,
} from '@/app/[username]/page';
import type { ProfileMode } from '@/features/profile/contracts';
import { getProfileMode } from '@/features/profile/registry';
import {
  PROFILE_MODE_ALIAS_MARKER,
  RENDER_FIXTURE_METADATA,
} from '@/lib/render-fixture-policy';
import { aliasBudgetProfileModeParams } from '@/lib/routing/alias-budget-static-params';

// Query modes are bounded by next.config.js. Seeded alias destinations are
// prerendered so the edge POP can serve them; every other profile stays
// on-demand. Keep the one-hour ISR cadence of the canonical page.
export const revalidate = 3600;

export function generateStaticParams() {
  return aliasBudgetProfileModeParams();
}

interface ProfileModeRenderPageProps {
  readonly params: Promise<{
    readonly username: string;
    readonly profileMode: string;
    readonly marker: string;
  }>;
}

function resolvePrivateProfileMode(
  value: string,
  marker: string
): ProfileMode | null {
  if (marker !== PROFILE_MODE_ALIAS_MARKER) return null;

  const mode = getProfileMode(value);
  if (mode === 'profile') return null;
  return mode;
}

/**
 * Private destination for the bounded `?mode=` rewrite in next.config.js.
 * The proxy rejects direct requests containing `__profile-mode-alias`; only
 * requests rewritten after the proxy can reach this page.
 */
export default async function ProfileModeRenderPage({
  params,
}: Readonly<ProfileModeRenderPageProps>) {
  const { username, profileMode, marker } = await params;
  const initialMode = resolvePrivateProfileMode(profileMode, marker);
  if (!initialMode) notFound();

  return ArtistPage({
    params: Promise.resolve({ username, __profileMode: initialMode }),
  });
}

export async function generateMetadata({
  params,
}: Readonly<ProfileModeRenderPageProps>) {
  const { username, profileMode, marker } = await params;
  if (!resolvePrivateProfileMode(profileMode, marker)) notFound();

  const profileMetadata = await generatePublicProfileMetadata({
    params: Promise.resolve({ username }),
  });
  return {
    ...profileMetadata,
    // Internal render destination — never indexable even when reachable via
    // the bounded `?mode=` rewrite.
    robots: RENDER_FIXTURE_METADATA.robots,
  };
}
