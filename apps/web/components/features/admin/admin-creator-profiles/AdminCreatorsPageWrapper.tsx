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
import {
  APP_CONTROL_BUTTON_CLASS,
  AppIconButton,
} from '@/components/atoms/AppIconButton';
import { APP_ROUTES } from '@/constants/routes';
import { useSetHeaderActions } from '@/contexts/HeaderActionsContext';
import { BatchIngestModal } from '@/features/admin/BatchIngestModal';
import { IngestProfileDropdown } from '@/features/admin/ingest-profile-dropdown';
import { DrawerToggleButton } from '@/features/dashboard/atoms/DrawerToggleButton';
import { cn } from '@/lib/utils';
import { mergeHrefSearchParams } from '@/lib/utils/merge-href-search-params';
import { AdminCreatorProfilesUnified } from './AdminCreatorProfilesUnified';
import type { AdminCreatorProfilesWithSidebarProps } from './types';

function BatchIngestButton({ onClick }: { readonly onClick: () => void }) {
  return (
    <button
      type='button'
      onClick={onClick}
      className={cn(
        APP_CONTROL_BUTTON_CLASS,
        'h-7 rounded-full px-3 text-[11.5px]'
      )}
    >
      <ListPlus className='h-3.5 w-3.5' />
      Batch Ingest
    </button>
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
      const query = searchQuery.trim();
      router.push(
        mergeHrefSearchParams(basePath, {
          page: 1,
          pageSize: props.pageSize,
          q: query.length > 0 ? query : null,
          sort: props.sort,
        })
      );
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
      <div className='flex items-center gap-1.5'>
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
              className='h-7 w-[210px] rounded-full border-(--linear-app-frame-seam) bg-[color-mix(in_oklab,var(--linear-app-content-surface)_98%,var(--linear-bg-surface-0))] px-3 text-[12px]'
              aria-label='Search creators by handle'
            />
            <AppIconButton
              type='button'
              onClick={handleSearchClose}
              className='h-7 w-7 border-transparent bg-transparent text-tertiary-token'
              ariaLabel='Close search'
            >
              <X className='h-3.5 w-3.5' aria-hidden='true' />
            </AppIconButton>
          </form>
        ) : (
          <AppIconButton
            type='button'
            onClick={handleSearchToggle}
            className='h-7 w-7 border-transparent bg-transparent text-secondary-token'
            ariaLabel='Open search'
          >
            <Search className='h-3.5 w-3.5' aria-hidden='true' />
          </AppIconButton>
        )}
        <BatchIngestButton onClick={handleOpenBatchModal} />
        <IngestProfileDropdown onIngestPending={handleIngestPending} />

        <div
          className='h-5 w-px bg-(--linear-app-frame-seam)'
          aria-hidden='true'
        />

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
