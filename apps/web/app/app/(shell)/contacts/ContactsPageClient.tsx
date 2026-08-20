'use client';

import {
  PAGE_TOOLBAR_META_TEXT_CLASS,
  PageToolbar,
} from '@/components/organisms/table';
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
        className='flex h-full min-h-0 flex-col'
        data-testid='contacts-table'
      >
        <PageToolbar
          start={
            <span className={PAGE_TOOLBAR_META_TEXT_CLASS}>0 contacts</span>
          }
        />
        <div className='flex min-h-0 flex-1 items-center justify-center'>
          <PageErrorState message='Failed to load contacts. Please refresh the page.' />
        </div>
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
