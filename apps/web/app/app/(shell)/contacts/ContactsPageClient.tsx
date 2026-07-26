'use client';

import { ContactsManager } from '@/features/dashboard/organisms/ContactsManager';
import { PageErrorState } from '@/features/feedback/PageErrorState';
import { useContactsQuery } from '@/lib/queries';
import type { DashboardContact } from '@/types/contacts';

const EMPTY_CONTACTS: DashboardContact[] = [];

export function ContactsPageClient({
  profileId,
  artistName,
  artistHandle,
}: {
  readonly profileId: string;
  readonly artistName: string;
  readonly artistHandle: string;
}) {
  const { data, isError, isLoading } = useContactsQuery(profileId);

  if (isError && !data) {
    return (
      <div
        className='flex h-full min-h-0 items-center justify-center'
        data-testid='contacts-table'
      >
        <PageErrorState message='Failed to load contacts. Please refresh the page.' />
      </div>
    );
  }

  return (
    <ContactsManager
      profileId={profileId}
      artistName={artistName}
      artistHandle={artistHandle}
      initialContacts={data ?? EMPTY_CONTACTS}
      isLoading={isLoading}
    />
  );
}
