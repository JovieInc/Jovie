import { redirect } from 'next/navigation';
import { ContactsManager } from '@/components/dashboard/organisms/ContactsManager';
import { PageErrorState } from '@/components/feedback/PageErrorState';
import { getCachedAuth } from '@/lib/auth/cached';
import { convertDrizzleCreatorProfileToArtist } from '@/types/db';
import { getDashboardDataCached } from '../actions';
import { getProfileContactsForOwner } from './actions';

// Revalidate every minute for settings data
export const revalidate = 60;

export default async function ContactsPage() {
  const { userId } = await getCachedAuth();

  if (!userId) {
    redirect('/signin?redirect_url=/app/dashboard/contacts');
  }

  try {
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
      <ContactsManager
        profileId={profileId}
        artistName={artist.name}
        artistHandle={artist.handle}
        initialContacts={contacts}
      />
    );
  } catch (error) {
    if (error instanceof Error && error.message === 'NEXT_REDIRECT') {
      throw error;
    }

    console.error('Error loading contacts:', error);

    return (
      <PageErrorState message='Failed to load contacts. Please refresh the page.' />
    );
  }
}
