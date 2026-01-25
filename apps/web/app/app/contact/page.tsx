import { redirect } from 'next/navigation';
import { ContactMode } from '@/components/dashboard/organisms/contact-mode';
import { getCachedAuth } from '@/lib/auth/cached';
import { convertDrizzleCreatorProfileToArtist } from '@/types/db';
import { getDashboardDataCached } from '../dashboard/actions';
import { getProfileContactsForOwner } from '../dashboard/contacts/actions';

export const revalidate = 60;

export default async function ContactPage() {
  const { userId } = await getCachedAuth();

  if (!userId) {
    redirect('/signin?redirect_url=/app/contact');
  }

  const dashboardData = await getDashboardDataCached();

  if (dashboardData.needsOnboarding) {
    redirect('/onboarding');
  }

  const profile = dashboardData.selectedProfile;
  const profileId = profile?.id;

  if (!profile || !profileId) {
    redirect('/app/dashboard');
  }

  const artist = convertDrizzleCreatorProfileToArtist(profile);
  const contacts = await getProfileContactsForOwner(profileId);

  return (
    <div className='h-full'>
      <ContactMode artistName={artist.name} contacts={contacts} />
    </div>
  );
}
