import { notFound } from 'next/navigation';
import ArtistPage, {
  generateMetadata as generatePublicProfileMetadata,
} from '@/app/[username]/page';
import type { ProfileMode } from '@/features/profile/contracts';
import { getProfileMode } from '@/features/profile/registry';

const PRIVATE_PROFILE_MODE_MARKER = '__profile-mode-alias';

// Query modes are bounded by next.config.js but discovered on demand. Keep each
// private destination on the same one-hour ISR cadence as the canonical page.
export const revalidate = 3600;

export function generateStaticParams() {
  return [];
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
  if (marker !== PRIVATE_PROFILE_MODE_MARKER) return null;

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

  return generatePublicProfileMetadata({
    params: Promise.resolve({ username }),
  });
}
