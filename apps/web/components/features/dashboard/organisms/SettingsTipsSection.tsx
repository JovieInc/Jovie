'use client';

import { Button } from '@jovie/ui';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import { usePreviewPanelState } from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { SettingsPanel } from '@/components/molecules/settings/SettingsPanel';
import { APP_ROUTES } from '@/constants/routes';
import { ProfileTipsSurface } from '@/features/dashboard/molecules/ProfileTipsSurface';
import { useProfileMonetizationSummary } from '@/lib/queries';

function LoadingState() {
  return (
    <div className='space-y-3 px-4 py-4 sm:px-5'>
      <div className='h-6 w-28 rounded-full skeleton' />
      <div className='h-4 w-full max-w-[28rem] rounded skeleton' />
      <div className='h-4 w-3/4 rounded skeleton' />
      <div className='flex gap-2'>
        <div className='h-8 w-28 rounded-md skeleton' />
        <div className='h-8 w-28 rounded-md skeleton' />
      </div>
    </div>
  );
}

function ErrorState({
  onRetry,
}: Readonly<{
  onRetry: () => void;
}>) {
  return (
    <div className='flex flex-col gap-3 px-4 py-4 sm:px-5'>
      <p className='text-[13px] leading-[19px] text-secondary-token'>
        Could not load your tips summary right now.
      </p>
      <div>
        <Button type='button' size='sm' variant='secondary' onClick={onRetry}>
          Try Again
        </Button>
      </div>
    </div>
  );
}

export function SettingsTipsSection() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { open } = usePreviewPanelState();
  const {
    data: summary,
    isError,
    isLoading,
    refetch,
  } = useProfileMonetizationSummary();

  const updateArtistProfileQuery = useCallback(
    (updates: Record<string, string>) => {
      const nextParams = new URLSearchParams(searchParams.toString());

      for (const [key, value] of Object.entries(updates)) {
        nextParams.set(key, value);
      }

      const nextSearch = nextParams.toString();
      router.replace(`${pathname}${nextSearch ? `?${nextSearch}` : ''}#tips`, {
        scroll: false,
      });
    },
    [pathname, router, searchParams]
  );

  const handleSetUsername = useCallback(() => {
    const usernameInput = document.getElementById('username');
    if (usernameInput instanceof HTMLInputElement) {
      usernameInput.focus();
      usernameInput.select();
      usernameInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, []);

  const handleSetUpTips = useCallback(() => {
    if (summary?.manageHref === APP_ROUTES.SETTINGS_PAYMENTS) {
      router.push(summary.manageHref);
      return;
    }

    open();
    updateArtistProfileQuery({ tab: 'earn', addLink: '1' });
  }, [open, router, summary, updateArtistProfileQuery]);

  const handleManagePayments = useCallback(() => {
    if (!summary) return;
    router.push(summary.manageHref);
  }, [router, summary]);

  const handleViewAnalytics = useCallback(() => {
    router.push(APP_ROUTES.DASHBOARD_AUDIENCE);
  }, [router]);

  return (
    <div id='tips'>
      <SettingsPanel
        title='Tips'
        description='Let fans support you directly from your profile.'
      >
        {isError && (
          <ErrorState
            onRetry={() => {
              refetch();
            }}
          />
        )}
        {!isError && (isLoading || !summary) && <LoadingState />}
        {!isError && !isLoading && summary && (
          <ProfileTipsSurface
            summary={summary}
            variant='settings'
            onSetUsername={handleSetUsername}
            onSetUpTips={handleSetUpTips}
            onManagePayments={handleManagePayments}
            onViewAnalytics={handleViewAnalytics}
          />
        )}
      </SettingsPanel>
    </div>
  );
}
