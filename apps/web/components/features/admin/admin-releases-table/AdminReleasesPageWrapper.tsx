'use client';

import { Input } from '@jovie/ui';
import { Search, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { AppIconButton } from '@/components/atoms/AppIconButton';
import { APP_ROUTES } from '@/constants/routes';
import { useSetHeaderActions } from '@/contexts/HeaderActionsContext';
import { DrawerToggleButton } from '@/features/dashboard/atoms/DrawerToggleButton';
import type { AdminReleaseRow, AdminReleasesSort } from '@/lib/admin/releases';
import { AdminReleasesTableUnified } from './AdminReleasesTableUnified';

interface AdminReleasesPageWrapperProps {
  readonly releases: AdminReleaseRow[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly search: string;
  readonly sort: AdminReleasesSort;
  readonly basePath?: string;
}

export function AdminReleasesPageWrapper(
  props: Readonly<AdminReleasesPageWrapperProps>
) {
  const router = useRouter();
  const basePath = props.basePath ?? APP_ROUTES.ADMIN_RELEASES;
  const [isSearchOpen, setIsSearchOpen] = useState(!!props.search);
  const [searchQuery, setSearchQuery] = useState(props.search);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

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

  const { setHeaderActions } = useSetHeaderActions();

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
              placeholder='Search releases or artists'
              value={searchQuery}
              onChange={event => setSearchQuery(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  handleSearchClose();
                }
              }}
              className='h-7 w-[210px] rounded-full border-(--linear-app-frame-seam) bg-[color-mix(in_oklab,var(--linear-app-content-surface)_98%,var(--linear-bg-surface-0))] px-3 text-[12px]'
              aria-label='Search releases or artists'
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
    handleSearchClose,
    handleSearchSubmit,
    handleSearchToggle,
    isSearchOpen,
    searchQuery,
  ]);

  return (
    <AdminReleasesTableUnified
      releases={props.releases}
      pageSize={props.pageSize}
      total={props.total}
      search={props.search}
      sort={props.sort}
    />
  );
}
