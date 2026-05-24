import { notFound } from 'next/navigation';
import {
  extractVenmoUsername,
  findVenmoLink,
  isAllowedVenmoUrl,
} from '@/features/profile/utils/venmo';
import { PayView } from '@/features/profile/views/PayView';
import { ProfileIntentPage } from '@/features/profile/views/ProfileIntentPage';
import {
  createProfileIntentMetadata,
  loadProfileIntentContext,
  type ProfileIntentRouteProps,
} from '../_lib/profile-intent-route';

export const dynamic = 'force-dynamic';

export const generateMetadata = createProfileIntentMetadata('pay');

export default async function PayPage({ params }: ProfileIntentRouteProps) {
  const { username } = await params;
  const { artist, result } = await loadProfileIntentContext(username);
  const venmoLink = findVenmoLink(result.links);
  if (!venmoLink || !isAllowedVenmoUrl(venmoLink)) {
    notFound();
  }

  return (
    <ProfileIntentPage
      mode='pay'
      artistName={artist.name}
      artistHandle={artist.handle}
    >
      <PayView
        artistHandle={artist.handle}
        venmoLink={venmoLink}
        venmoUsername={extractVenmoUsername(venmoLink)}
      />
    </ProfileIntentPage>
  );
}
