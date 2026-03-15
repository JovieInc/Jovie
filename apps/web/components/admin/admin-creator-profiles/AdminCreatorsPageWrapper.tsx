'use client';

import { Input } from '@jovie/ui';
import { ListPlus, Search, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { BatchIngestModal } from '@/components/admin/BatchIngestModal';
import { IngestProfileDropdown } from '@/components/admin/ingest-profile-dropdown';
import { DashboardHeaderActionButton } from '@/components/dashboard/atoms/DashboardHeaderActionButton';
import { DrawerToggleButton } from '@/components/dashboard/atoms/DrawerToggleButton';
import { APP_ROUTES } from '@/constants/routes';
import { useSetHeaderActions } from '@/contexts/HeaderActionsContext';
import { AdminCreatorProfilesUnified } from './AdminCreatorProfilesUnified';
import type { AdminCreatorProfilesWithSidebarProps } from './types';

function BatchIngestButton({ onClick }: { readonly onClick: () => void }) {
  return (
    <DashboardHeaderActionButton
      ariaLabel='Open batch ingest'
      onClick={onClick}
      icon={<ListPlus className='h-3.5 w-3.5' />}
      label='Batch Ingest'
      className='px-2.5'
    />
  );
}

export function AdminCreatorsPageWrapper(
  props: Readonly<AdminCreatorProfilesWithSidebarProps>
) {
  const router = useRouter();
  const { setHeaderActions } = useSetHeaderActions();
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const basePath = props.basePath ?? APP_ROUTES.ADMIN_CREATORS;
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState(props.search);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const handleIngestPending = useCallback(() => {
    router.refresh();
  }, [router]);

  const handleOpenBatchModal = useCallback(() => {
    setBatchModalOpen(true);
  }, []);

  const handleSearchClose = useCallback(() => {
    setIsSearchOpen(false);
    setSearchQuery('');
    if (props.search) {
      router.push(basePath);
    }
  }, [basePath, props.search, router]);

  const handleSearchSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const params = new URLSearchParams();
      params.set('sort', props.sort);
      params.set('pageSize', String(props.pageSize));
      params.set('page', '1');

      const query = searchQuery.trim();
      if (query.length > 0) {
        params.set('q', query);
      }

      const queryString = params.toString();
      router.push(queryString ? `${basePath}?${queryString}` : basePath);
    },
    [basePath, props.pageSize, props.sort, router, searchQuery]
  );

  const handleSearchToggle = useCallback(() => {
    setIsSearchOpen(open => {
      const nextOpen = !open;
      if (nextOpen) {
        setSearchQuery(props.search);
        setTimeout(() => searchInputRef.current?.focus(), 0);
      } else {
        setSearchQuery('');
        if (props.search) {
          router.push(basePath);
        }
      }
      return nextOpen;
    });
  }, [basePath, props.search, router]);

  // Register custom header actions on mount
  useEffect(() => {
    setHeaderActions(
      <div className='flex items-center gap-1'>
        {isSearchOpen ? (
          <form
            onSubmit={handleSearchSubmit}
            className='flex items-center gap-1'
          >
            <Input
              ref={searchInputRef}
              name='q'
              placeholder='Search by handle'
              value={searchQuery}
              onChange={event => setSearchQuery(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  handleSearchClose();
                }
              }}
              className='h-8 w-[220px] border-subtle bg-surface text-[13px]'
              aria-label='Search creators by handle'
            />
            <button
              type='button'
              onClick={handleSearchClose}
              className='inline-flex h-8 w-8 items-center justify-center rounded-md text-tertiary-token transition-colors hover:bg-interactive-hover hover:text-primary-token'
              aria-label='Close search'
            >
              <X className='h-3.5 w-3.5' aria-hidden='true' />
            </button>
          </form>
        ) : (
          <button
            type='button'
            onClick={handleSearchToggle}
            className='inline-flex h-8 w-8 items-center justify-center rounded-md text-secondary-token transition-colors hover:bg-interactive-hover hover:text-primary-token'
            aria-label='Open search'
          >
            <Search className='h-3.5 w-3.5' aria-hidden='true' />
          </button>
        )}
        <BatchIngestButton onClick={handleOpenBatchModal} />
        <IngestProfileDropdown onIngestPending={handleIngestPending} />

        {/* Vertical divider */}
        <div className='h-6 w-px bg-border' aria-hidden='true' />

        {/* Drawer toggle button */}
        <DrawerToggleButton />
      </div>
    );

    return () => {
      setHeaderActions(null);
    };
  }, [
    setHeaderActions,
    handleIngestPending,
    handleOpenBatchModal,
    handleSearchClose,
    handleSearchSubmit,
    handleSearchToggle,
    isSearchOpen,
    searchQuery,
  ]);

  return (
    <>
      <AdminCreatorProfilesUnified {...props} />
      <BatchIngestModal
        open={batchModalOpen}
        onOpenChange={setBatchModalOpen}
        onComplete={() => router.refresh()}
      />
    </>
  );
}
