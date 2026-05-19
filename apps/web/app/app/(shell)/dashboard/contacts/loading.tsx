'use client';

import { type ColumnDef, createColumnHelper } from '@tanstack/react-table';
import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';
import { UnifiedTableSkeleton } from '@/components/organisms/table';
import { SKELETON_ROW_COUNT } from '@/lib/constants/layout';

type ContactsLoadingRow = {
  readonly role: string;
  readonly name: string;
  readonly territories: string;
  readonly email: string;
  readonly phone: string;
  readonly actions: string;
};

const contactLoadingColumnHelper = createColumnHelper<ContactsLoadingRow>();

function createLoadingHeader(width: string) {
  function ContactsLoadingHeader() {
    return <LoadingSkeleton height='h-4' width={width} rounded='md' />;
  }

  return ContactsLoadingHeader;
}

const CONTACTS_LOADING_COLUMNS = [
  contactLoadingColumnHelper.accessor('role', {
    id: 'role',
    header: createLoadingHeader('w-[112px]'),
    size: 180,
    minSize: 180,
  }),
  contactLoadingColumnHelper.accessor('name', {
    id: 'name',
    header: createLoadingHeader('w-[128px]'),
    size: 200,
    minSize: 200,
  }),
  contactLoadingColumnHelper.accessor('territories', {
    id: 'territories',
    header: createLoadingHeader('w-[96px]'),
    size: 140,
    minSize: 140,
  }),
  contactLoadingColumnHelper.accessor('email', {
    id: 'email',
    header: createLoadingHeader('w-[144px]'),
    size: 200,
    minSize: 200,
  }),
  contactLoadingColumnHelper.accessor('phone', {
    id: 'phone',
    header: createLoadingHeader('w-[96px]'),
    size: 160,
    minSize: 160,
  }),
  contactLoadingColumnHelper.accessor('actions', {
    id: 'actions',
    header: createLoadingHeader('w-[24px]'),
    size: 48,
    minSize: 48,
  }),
] as ColumnDef<ContactsLoadingRow, unknown>[];

const CONTACTS_LOADING_SKELETON_CONFIG = [
  { width: '112px', variant: 'text' as const },
  { width: '128px', variant: 'text' as const },
  { width: '96px', variant: 'badge' as const },
  { width: '144px', variant: 'text' as const },
  { width: '96px', variant: 'text' as const },
  { width: '24px', variant: 'avatar' as const },
];

const CONTACTS_MOBILE_ROW_KEYS = Array.from(
  { length: SKELETON_ROW_COUNT.MOBILE },
  (_, i) => `contacts-mobile-${i + 1}`
);

export default function ContactsLoading() {
  return (
    <div className='flex h-full min-h-0 flex-col' aria-busy='true'>
      {/* Mobile: card layout (visible below sm) */}
      <div className='flex-1 min-h-0 overflow-hidden sm:hidden'>
        <div className='divide-y divide-subtle'>
          {CONTACTS_MOBILE_ROW_KEYS.map(key => (
            <div key={key} className='flex items-center gap-3 px-4 py-3'>
              <LoadingSkeleton
                height='h-10'
                width='w-10'
                rounded='full'
                className='shrink-0'
              />
              <div className='flex-1 min-w-0 space-y-1.5'>
                <LoadingSkeleton height='h-4' width='w-32' rounded='md' />
                <LoadingSkeleton height='h-3' width='w-24' rounded='sm' />
                <LoadingSkeleton height='h-3' width='w-40' rounded='sm' />
              </div>
              <LoadingSkeleton
                height='h-8'
                width='w-8'
                rounded='md'
                className='shrink-0'
              />
            </div>
          ))}
        </div>
      </div>

      {/* Desktop: table layout (hidden below sm) */}
      <div className='max-sm:hidden flex-1 min-h-0 overflow-hidden'>
        <UnifiedTableSkeleton<ContactsLoadingRow>
          columns={CONTACTS_LOADING_COLUMNS}
          skeletonRows={SKELETON_ROW_COUNT.TABLE}
          skeletonColumnConfig={CONTACTS_LOADING_SKELETON_CONFIG}
          rowHeight={44}
          minWidth='0'
          containerClassName='h-full'
          hideHeader={false}
        />
      </div>

      {/* Footer matching actual contacts footer */}
      <div className='shrink-0 flex items-center justify-between border-t border-subtle bg-(--linear-app-content-surface) px-4 py-2'>
        <LoadingSkeleton height='h-4' width='w-20' rounded='md' />
        <LoadingSkeleton height='h-8' width='w-28' rounded='lg' />
      </div>
    </div>
  );
}
