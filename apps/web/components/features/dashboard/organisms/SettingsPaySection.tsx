'use client';

import { Button } from '@jovie/ui';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import { usePreviewPanelState } from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { SettingsPanel } from '@/components/molecules/settings/SettingsPanel';
import { APP_ROUTES } from '@/constants/routes';
import { ProfilePaySurface } from '@/features/dashboard/molecules/ProfilePaySurface';
import { useProfileMonetizationSummary } from '@/lib/queries';

// Mirrors ProfilePaySurface's settings layout without new arbitrary values:
// below lg the 148px QR box stacks under the text (gap-4); from lg the text
// takes the rest of the row and the QR sits beside it, which is what the
// loaded minmax(0,1fr) 148px grid with gap-4 gives. Without the QR box the
// loaded block grew on phones and pushed the panels below down (CLS 0.206 on
// /app/earnings, which lands on #pay).
function LoadingState() {
  return (
    <div
      className='flex flex-col gap-4 px-4 py-4 sm:px-5 lg:flex-row lg:items-start'
      data-testid='settings-pay-loading'
    >
      <div className='min-w-0 space-y-3 lg:flex-1'>
        {/* The status pill's own box (text-2xs line, py-0.5, 1px border),
            so it is exactly as tall as the loaded pill. */}
        <div className='flex'>
          <span
            aria-hidden='true'
            className='inline-flex w-28 rounded-full border border-transparent px-2 py-0.5 text-2xs skeleton'
            data-testid='settings-pay-loading-pill'
          >
            {'\u00a0'}
          </span>
        </div>
        {/* Two 19px line boxes (h-4.75), the narrative's leading, no gap. */}
        <div data-testid='settings-pay-loading-narrative'>
          <div className='flex h-4.75 items-center'>
            <div className='h-3.5 w-full max-w-md rounded skeleton' />
          </div>
          <div className='flex h-4.75 items-center'>
            <div className='h-3.5 w-3/4 rounded skeleton' />
          </div>
        </div>
        {/* mb-2.5: the loaded actions sit in a space-y-2.5 block whose last
            child is the sr-only status line, so the row keeps that margin. */}
        <div
          className='mb-2.5 flex gap-2'
          data-testid='settings-pay-loading-actions'
        >
          <div className='h-8 w-28 rounded-md skeleton' />
          <div className='h-8 w-28 rounded-md skeleton' />
        </div>
      </div>
      <div className='flex lg:justify-end'>
        <div
          className='h-37 w-37 shrink-0 rounded-2xl skeleton'
          data-testid='settings-pay-loading-qr'
        />
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
      <p className='text-app leading-[19px] text-secondary-token'>
        Could not load your payments summary right now.
      </p>
      <div>
        <Button type='button' size='sm' variant='secondary' onClick={onRetry}>
          Try Again
        </Button>
      </div>
    </div>
  );
}

export function SettingsPaySection() {
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
      const searchSuffix = nextSearch ? `?${nextSearch}` : '';
      router.replace(`${pathname}${searchSuffix}#pay`, {
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
    router.push(APP_ROUTES.AUDIENCE);
  }, [router]);

  return (
    <div id='pay'>
      <SettingsPanel
        title='Payments'
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
          <ProfilePaySurface
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
