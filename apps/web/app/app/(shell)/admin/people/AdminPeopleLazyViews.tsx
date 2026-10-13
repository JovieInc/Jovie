'use client';

import dynamic from 'next/dynamic';

/**
 * Lazy boundaries for the People views that are not the default Contacts tab.
 * Only one view renders per request, so each table loads as its own chunk
 * (still server-rendered) instead of every view shipping in the
 * /app/admin/people entry JS. The boundary has to live in a client module:
 * next/dynamic in a Server Component does not code-split client components.
 */

export const AdminAssetsPageWrapper = dynamic(() =>
  import('@/components/features/admin/admin-assets-table').then(
    module => module.AdminAssetsPageWrapper
  )
);

export const AdminCreatorsPageWrapper = dynamic(() =>
  import(
    '@/components/features/admin/admin-creator-profiles/AdminCreatorsPageWrapper'
  ).then(module => module.AdminCreatorsPageWrapper)
);

export const AdminFeedbackTable = dynamic(() =>
  import('@/components/features/admin/feedback-table/AdminFeedbackTable').then(
    module => module.AdminFeedbackTable
  )
);

export const AdminReleasesPageWrapper = dynamic(() =>
  import('@/components/features/admin/admin-releases-table').then(
    module => module.AdminReleasesPageWrapper
  )
);

export const AdminUsersTableUnified = dynamic(() =>
  import(
    '@/components/features/admin/admin-users-table/AdminUsersTableUnified'
  ).then(module => module.AdminUsersTableUnified)
);

export const AdminWaitlistTableWithViews = dynamic(() =>
  import(
    '@/components/features/admin/waitlist-table/AdminWaitlistTableWithViews'
  ).then(module => module.AdminWaitlistTableWithViews)
);

export const WaitlistSettingsPanel = dynamic(() =>
  import('@/components/features/admin/WaitlistSettingsPanel').then(
    module => module.WaitlistSettingsPanel
  )
);
