import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getProfileModeRenderStaticParams } from '@/app/[username]/_lib/profile-static-params';
import ArtistPage, {
  generateMetadata as generatePublicProfileMetadata,
} from '@/app/[username]/page';
import type { ProfileMode } from '@/features/profile/contracts';
import { getProfileMode } from '@/features/profile/registry';
import {
  PROFILE_MODE_ALIAS_MARKER,
  RENDER_FIXTURE_METADATA,
} from '@/lib/render-fixture-policy';

// Rewritten profile modes share the canonical page's one-hour ISR cadence and
// its per-request proxy publication gate (the proxy sees `/<username>`).
export const revalidate = 3600;

export function generateStaticParams() {
  return getProfileModeRenderStaticParams();
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
}: Readonly<ProfileModeRenderPageProps>): Promise<Metadata> {
  const { username, profileMode, marker } = await params;
  if (!resolvePrivateProfileMode(profileMode, marker)) {
    // notFound() inside generateMetadata bypasses the app router's not-found
    // boundary and renders Next's raw __next_error__ 404 shell (observed on
    // production and in the workflow_dispatch CI lanes). Return miss metadata
    // here and let the page's own notFound() below render the branded
    // app/[username]/not-found.tsx boundary with its data-testid="not-found"
    // sentinel and a real 404 status.
    //
    // No robots on the miss metadata: the 404 render already gets Next's
    // automatic <meta name="robots" content="noindex"> for every status > 400
    // render (app-render NonIndex), so an explicit robots here emitted a
    // SECOND robots meta and failed the synthetic smoke's noindex-count-1
    // assertion (JOV-12153). Same title-only shape as the [slug] miss
    // pattern; the X-Robots-Tag: noindex, nofollow header from next.config
    // still covers this destination.
    return { title: 'Not Found' };
  }

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
