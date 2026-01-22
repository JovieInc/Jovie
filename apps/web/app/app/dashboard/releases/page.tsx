import { redirect } from 'next/navigation';
import { ReleaseProviderMatrix } from '@/components/dashboard/organisms/release-provider-matrix';
import { getCachedAuth } from '@/lib/auth/cached';
import { checkSpotifyConnection, loadReleaseMatrix } from './actions';
import { primaryProviderKeys, providerConfig } from './config';

export default async function ReleasesPage() {
  const { userId } = await getCachedAuth();

  if (!userId) {
    redirect('/sign-in?redirect_url=/app/dashboard/releases');
  }

  const [releases, spotifyStatus] = await Promise.all([
    loadReleaseMatrix(),
    checkSpotifyConnection(),
  ]);

  return (
    <ReleaseProviderMatrix
      profileId={spotifyStatus.profileId ?? releases[0]?.profileId ?? ''}
      releases={releases}
      providerConfig={providerConfig}
      primaryProviders={primaryProviderKeys}
      spotifyConnected={spotifyStatus.connected}
      spotifyArtistName={spotifyStatus.artistName}
    />
  );
}
