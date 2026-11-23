'use client';

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  PlainButton,
} from '@jovie/ui';
import {
  BarChart3,
  Check,
  Link2Off,
  MoreHorizontal,
  MousePointerClick,
  Pencil,
  ScanLine,
  Wallet,
} from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { ContentMetricCard } from '@/components/molecules/ContentMetricCard';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import {
  Dialog,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from '@/components/organisms/Dialog';
import { PageShell } from '@/components/organisms/PageShell';
import { BASE_URL } from '@/constants/domains';
import { EarningsTab } from '@/features/dashboard/organisms/EarningsTab';
import { ShopifyStoreCard } from '@/features/dashboard/organisms/shopify/ShopifyStoreCard';
import {
  TipLinkSection,
  VenmoConnectDialog,
  VenmoEditForm,
} from './DashboardPay.parts';
import { useDashboardPay } from './useDashboardPay';
import { formatCount } from './utils';

// =============================================================================
// Constants
// =============================================================================

// =============================================================================
// Sub-components
// =============================================================================

// -----------------------------------------------------------------------------

interface VenmoConnectedBadgeProps {
  readonly venmoHandle: string;
  readonly onEdit: () => void;
  readonly onDisconnect: () => void;
}

const VenmoConnectedBadge = memo(function VenmoConnectedBadge({
  venmoHandle,
  onEdit,
  onDisconnect,
}: VenmoConnectedBadgeProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <PlainButton
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          className='inline-flex items-center gap-1.5 rounded-full border border-subtle bg-surface-1 px-2.5 py-1 text-app font-caption text-secondary-token transition-colors hover:bg-surface-2 sm:gap-2 sm:px-3 sm:py-1.5 sm:text-sm'
        >
          <Wallet className='h-3.5 w-3.5 sm:h-4 sm:w-4' />
          <span className='truncate'>@{venmoHandle}</span>
          {isHovered || isOpen ? (
            <MoreHorizontal className='h-3.5 w-3.5 sm:h-4 sm:w-4' />
          ) : (
            <Check className='h-3.5 w-3.5 text-success sm:h-4 sm:w-4' />
          )}
        </PlainButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' sideOffset={6}>
        <DropdownMenuItem
          onSelect={() => {
            onEdit();
          }}
        >
          <Pencil className='mr-2 h-3.5 w-3.5' />
          Edit
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant='destructive'
          onSelect={() => {
            onDisconnect();
          }}
        >
          <Link2Off className='mr-2 h-3.5 w-3.5' />
          Disconnect
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
});

// -----------------------------------------------------------------------------

// =============================================================================
// Main Component
// =============================================================================

export function DashboardPay() {
  const dashboardData = useDashboardData();
  const {
    artist,
    venmoHandle,
    setVenmoHandle,
    isEditing,
    setIsEditing,
    isSaving,
    saveSuccess,
    hasVenmoHandle,
    handleSaveVenmo,
    handleCancel,
    handleDisconnect,
  } = useDashboardPay();

  const [isConnectOpen, setIsConnectOpen] = useState(false);

  const handleCloseConnect = useCallback(() => {
    setIsConnectOpen(false);
    setVenmoHandle('');
  }, [setVenmoHandle]);

  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  useEffect(() => {
    if (!hasVenmoHandle || !isConnectOpen) return;

    setIsConnectOpen(false);
    setVenmoHandle('');
  }, [hasVenmoHandle, isConnectOpen, setVenmoHandle]);

  const tipUrls = useMemo(() => {
    const tipHandle = artist?.handle ?? '';
    const tipRelativePath = tipHandle ? `/${tipHandle}/pay` : '/pay';
    const tipRelativePathLink = `${tipRelativePath}?source=link`;
    const tipUrl = `${BASE_URL}${tipRelativePathLink}`;

    return {
      tipRelativePathLink,
      tipUrl,
    };
  }, [artist?.handle]);

  const { tipClicks, qrTipClicks, linkTipClicks } = dashboardData.tippingStats;

  if (!artist) {
    return null;
  }

  return (
    <>
      <h1 className='sr-only'>Earnings Dashboard</h1>
      <PageShell
        frame='none'
        maxWidth='wide'
        contentPadding='default'
        data-testid='dashboard-earnings-workspace'
      >
        <div
          className='flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overflow-x-hidden'
          data-testid='dashboard-earnings-content-panel'
        >
          {hasVenmoHandle && !isEditing ? (
            <div className='flex justify-end'>
              <VenmoConnectedBadge
                venmoHandle={artist.venmo_handle?.replace(/^@/, '') ?? ''}
                onEdit={() => {
                  setIsEditing(true);
                  setIsEditDialogOpen(true);
                }}
                onDisconnect={handleDisconnect}
              />
            </div>
          ) : null}

          {!hasVenmoHandle && (
            <>
              <ContentSurfaceCard className='px-6 py-12 sm:px-8 sm:py-14'>
                <div className='mx-auto flex max-w-md flex-col items-center text-center'>
                  <div
                    className='mb-4 flex h-11 w-11 items-center justify-center rounded-lg border border-accent/20 bg-accent/10'
                    aria-hidden='true'
                  >
                    <Wallet className='h-5 w-5 text-accent-token' />
                  </div>
                  <h2 className='text-balance text-base font-semibold tracking-[-0.011em] text-primary-token'>
                    Connect Venmo To Unlock Earnings
                  </h2>
                  <p className='mt-2 text-app leading-5 text-secondary-token sm:text-sm'>
                    Link your Venmo once to start receiving payments and reveal
                    your full earnings dashboard.
                  </p>
                  <Button
                    onClick={() => setIsConnectOpen(true)}
                    variant='primary'
                    size='sm'
                    className='mt-5 rounded-lg text-2xs font-caption tracking-tight'
                  >
                    Connect Venmo
                  </Button>
                </div>
              </ContentSurfaceCard>
              <VenmoConnectDialog
                open={isConnectOpen}
                onClose={handleCloseConnect}
                venmoHandle={venmoHandle}
                onVenmoHandleChange={setVenmoHandle}
                onSave={handleSaveVenmo}
                isSaving={isSaving}
                saveSuccess={saveSuccess}
              />
            </>
          )}

          {hasVenmoHandle && (
            <>
              <ContentSurfaceCard className='overflow-hidden p-0'>
                <div className='grid grid-cols-1 gap-0 sm:grid-cols-[minmax(0,1fr)_320px]'>
                  <div className='grid grid-cols-2 gap-0 [&>*]:border-b [&>*]:border-subtle sm:grid-cols-3 sm:[&>*]:border-b-0 sm:[&>*]:border-r sm:[&>*:last-child]:border-r-0'>
                    <ContentMetricCard
                      as='section'
                      layout='icon-chip'
                      appearance='plain'
                      label='QR Scans'
                      aria-label='QR Scans Metric'
                      value={formatCount(qrTipClicks)}
                      subtitle='Fans who scanned your QR'
                      icon={ScanLine}
                      tone='success'
                    />
                    <ContentMetricCard
                      as='section'
                      layout='icon-chip'
                      appearance='plain'
                      label='Link Clicks'
                      aria-label='Link Clicks Metric'
                      value={formatCount(linkTipClicks)}
                      subtitle='Fans who clicked your link'
                      icon={MousePointerClick}
                      tone='info'
                    />
                    <ContentMetricCard
                      as='section'
                      layout='icon-chip'
                      appearance='plain'
                      label='Total Visits'
                      aria-label='Total Visits Metric'
                      value={formatCount(tipClicks)}
                      subtitle='QR + link combined'
                      icon={BarChart3}
                      tone='accent'
                    />
                  </div>
                  <div className='border-t border-subtle px-4 py-4 sm:border-l sm:border-t-0 sm:px-5'>
                    <TipLinkSection
                      tipUrl={tipUrls.tipUrl}
                      tipRelativePathLink={tipUrls.tipRelativePathLink}
                    />
                  </div>
                </div>
              </ContentSurfaceCard>

              <EarningsTab />
            </>
          )}

          <ShopifyStoreCard />
        </div>
      </PageShell>

      <Dialog
        open={isEditDialogOpen}
        onClose={() => {
          handleCancel();
          setIsEditDialogOpen(false);
        }}
        size='sm'
      >
        <DialogTitle>Edit Venmo</DialogTitle>
        <DialogDescription>Update your Venmo username.</DialogDescription>
        <DialogBody>
          <VenmoEditForm
            venmoHandle={venmoHandle}
            onVenmoHandleChange={setVenmoHandle}
            onSave={() => {
              handleSaveVenmo();
              setIsEditDialogOpen(false);
            }}
            onCancel={() => {
              handleCancel();
              setIsEditDialogOpen(false);
            }}
            isSaving={isSaving}
          />
        </DialogBody>
      </Dialog>
    </>
  );
}
