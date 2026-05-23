import { notFound } from 'next/navigation';
import { ContactView } from '@/features/profile/views/ContactView';
import { ProfileIntentPage } from '@/features/profile/views/ProfileIntentPage';
import { toPublicContacts } from '@/lib/contacts/mapper';
import {
  createProfileIntentMetadata,
  loadProfileIntentContext,
  type ProfileIntentRouteProps,
} from '../_lib/profile-intent-route';

export const dynamic = 'force-dynamic';

export const generateMetadata = createProfileIntentMetadata('contact');

export default async function ContactPage({ params }: ProfileIntentRouteProps) {
  const { username } = await params;
  const { artist, result } = await loadProfileIntentContext(username);
  const contacts = toPublicContacts(result.contacts, artist.name);
  const availableContacts = contacts.filter(
    contact => contact.channels.length > 0
  );
  if (availableContacts.length === 0) {
    notFound();
  }

  return (
    <ProfileIntentPage
      mode='contact'
      artistName={artist.name}
      artistHandle={artist.handle}
    >
      <ContactView artistHandle={artist.handle} contacts={availableContacts} />
    </ProfileIntentPage>
  );
}
