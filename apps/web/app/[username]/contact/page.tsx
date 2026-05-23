import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BASE_URL } from '@/constants/app';
import { ContactView } from '@/features/profile/views/ContactView';
import { buildViewMetadata } from '@/features/profile/views/metadata';
import { ProfileIntentPage } from '@/features/profile/views/ProfileIntentPage';
import { toPublicContacts } from '@/lib/contacts/mapper';
import { convertCreatorProfileToArtist } from '@/types/db';
import { getProfileAndLinks } from '../_lib/public-profile-loader';

export const dynamic = 'force-dynamic';

interface Props {
  readonly params: Promise<{
    readonly username: string;
  }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  const result = await getProfileAndLinks(username);
  if (result.status !== 'ok' || !result.profile) {
    return {};
  }

  const artist = convertCreatorProfileToArtist(result.profile);
  return buildViewMetadata('contact', {
    artistName: artist.name,
    artistHandle: artist.handle,
    baseUrl: BASE_URL,
  });
}

export default async function ContactPage({ params }: Props) {
  const { username } = await params;
  const result = await getProfileAndLinks(username);
  if (result.status !== 'ok' || !result.profile) {
    notFound();
  }

  const artist = convertCreatorProfileToArtist(result.profile);
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
