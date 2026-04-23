'use client';

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
} from '@jovie/ui';
import {
  BarChart3,
  Check,
  Copy,
  Link2,
  Link2Off,
  MoreHorizontal,
  MousePointerClick,
  Pencil,
  ScanLine,
  Wallet,
} from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import {
  Dialog,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from '@/components/organisms/Dialog';
import { PageShell } from '@/components/organisms/PageShell';
import { BASE_URL } from '@/constants/domains';
import { CopyToClipboardButton } from '@/features/dashboard/molecules/CopyToClipboardButton';
import { EarningsTab } from '@/features/dashboard/organisms/EarningsTab';
import { ShopifyStoreCard } from '@/features/dashboard/organisms/shopify/ShopifyStoreCard';
import { cn } from '@/lib/utils';
import { useDashboardPay } from './useDashboardPay';
import { formatCount } from './utils';

// =============================================================================
// Constants
// =============================================================================

// =============================================================================
// Sub-components
// =============================================================================

interface StatCardProps {
  readonly label: string;
  readonly value: number;
  readonly description: string;
  readonly icon: React.ComponentType<{ className?: string }>;
  readonly iconChipClassName: string;
  readonly iconClassName: string;
  readonly bordered?: boolean;
}

const StatCard = memo(function StatCard({
  label,
  value,
  description,
  icon: Icon,
  iconChipClassName,
  iconClassName,
  bordered = true,
}: StatCardProps) {
  return (
    <ContentSurfaceCard
      className={cn(
        'p-3.5 sm:p-4',
        !bordered && 'border-0 bg-transparent shadow-none',
        bordered && 'overflow-hidden'
      )}
      aria-label={`${label} metric`}
    >
      <dl className='flex h-full flex-col'>
        <div className='flex items-center gap-2'>
          <div
            className={cn(
              'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
              iconChipClassName
            )}
            aria-hidden='true'
          >
            <Icon className={cn('h-3.5 w-3.5', iconClassName)} />
          </div>
          <dt className='text-app font-caption text-secondary-token'>
            {label}
          </dt>
        </div>
        <dd className='mt-2 text-2xl font-semibold tabular-nums leading-none tracking-[-0.011em] text-primary-token sm:text-3xl'>
          {formatCount(value)}
        </dd>
        <dd className='mt-1.5 text-2xs leading-4 text-tertiary-token sm:text-app'>
          {description}
        </dd>
      </dl>
    </ContentSurfaceCard>
  );
});

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
        <button
          type='button'
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
        </button>
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

interface VenmoEditFormProps {
  readonly venmoHandle: string;
  readonly onVenmoHandleChange: (value: string) => void;
  readonly onSave: () => void;
  readonly onCancel: () => void;
  readonly isSaving: boolean;
}

const VenmoEditForm = memo(function VenmoEditForm({
  venmoHandle,
  onVenmoHandleChange,
  onSave,
  onCancel,
  isSaving,
}: VenmoEditFormProps) {
  return (
    <div className='space-y-3'>
      <div className='flex items-center gap-2'>
        <span className='text-app text-secondary-token'>@</span>
        <Input
          type='text'
          value={venmoHandle}
          onChange={e => onVenmoHandleChange(e.target.value)}
          placeholder='your-username'
          autoFocus
          className='h-8 min-w-0 flex-1'
        />
      </div>
      <div className='flex items-center gap-2'>
        <Button
          onClick={onSave}
          disabled={isSaving || !venmoHandle.trim()}
          variant='primary'
          size='sm'
        >
          {isSaving ? 'Saving…' : 'Save'}
        </Button>
        <Button
          onClick={onCancel}
          disabled={isSaving}
          variant='ghost'
          size='sm'
        >
          Cancel
        </Button>
      </div>
    </div>
  );
});

// -----------------------------------------------------------------------------

interface VenmoConnectDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly venmoHandle: string;
  readonly onVenmoHandleChange: (value: string) => void;
  readonly onSave: () => void;
  readonly isSaving: boolean;
  readonly saveSuccess: string | null;
}

const VenmoConnectDialog = memo(function VenmoConnectDialog({
  open,
  onClose,
  venmoHandle,
  onVenmoHandleChange,
  onSave,
  isSaving,
  saveSuccess,
}: VenmoConnectDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} size='sm'>
      <div className='flex items-start gap-3'>
        <div
          className='flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-accent/20 bg-accent/10'
          aria-hidden='true'
        >
          <Wallet className='h-4.5 w-4.5 text-accent-token' />
        </div>
        <div className='min-w-0 flex-1'>
          <DialogTitle className='text-[15px] font-semibold tracking-[-0.011em] text-primary-token'>
            Connect Venmo
          </DialogTitle>
          <DialogDescription className='mt-0.5 text-app leading-5 text-secondary-token'>
            Link your Venmo to start receiving payments from fans.
          </DialogDescription>
        </div>
      </div>

      <DialogBody>
        <div className='space-y-3'>
          <div>
            <label
              htmlFor='venmo-handle'
              className='mb-1.5 block text-app font-caption text-secondary-token'
            >
              Venmo Username
            </label>
            <div className='flex items-center gap-2'>
              <span className='text-app text-tertiary-token'>@</span>
              <Input
                type='text'
                id='venmo-handle'
                value={venmoHandle}
                onChange={e => onVenmoHandleChange(e.target.value)}
                placeholder='your-username'
                autoFocus
                className='flex-1'
              />
            </div>
          </div>
          <div className='flex items-center gap-2'>
            <Button
              onClick={onSave}
              disabled={isSaving || !venmoHandle.trim()}
              variant='primary'
              size='sm'
            >
              {isSaving ? 'Connecting…' : 'Connect'}
            </Button>
            <Button
              onClick={onClose}
              disabled={isSaving}
              variant='ghost'
              size='sm'
            >
              Cancel
            </Button>
          </div>
          {saveSuccess && (
            <output
              className='flex items-center gap-2 rounded-lg border border-subtle bg-surface-1 px-3 py-2 text-app font-caption text-success'
              aria-live='polite'
            >
              <Check className='h-3.5 w-3.5' />
              {saveSuccess}
            </output>
          )}
        </div>
      </DialogBody>
    </Dialog>
  );
});

// -----------------------------------------------------------------------------

interface TipLinkSectionProps {
  readonly tipUrl: string;
  readonly tipRelativePathLink: string;
}

const TipLinkSection = memo(function TipLinkSection({
  tipUrl,
  tipRelativePathLink,
}: TipLinkSectionProps) {
  return (
    <div>
      <div className='mb-3 flex items-center gap-2'>
        <div
          className='flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] border border-subtle bg-surface-1'
          aria-hidden='true'
        >
          <Link2 className='h-3.5 w-3.5 text-blue-500 dark:text-blue-400' />
        </div>
        <h3 className='text-app font-caption text-primary-token'>Pay Link</h3>
      </div>

      <div className='flex items-center gap-2 rounded-[10px] border border-(--linear-app-frame-seam) bg-surface-0 px-3 py-2.5'>
        <Copy className='max-sm:hidden h-3.5 w-3.5 shrink-0 text-tertiary-token' />
        <span className='min-w-0 flex-1 truncate text-app text-secondary-token'>
          {tipUrl}
        </span>
        <CopyToClipboardButton
          relativePath={tipRelativePathLink}
          idleLabel='Copy'
          successLabel='Copied'
          errorLabel='Failed'
          className='h-7 shrink-0 px-2.5 text-app'
        />
      </div>
      <p className='mt-2 text-2xs text-tertiary-token sm:text-app'>
        Share this link anywhere to receive payments.
      </p>
    </div>
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
        maxWidth='wide'
        contentPadding='compact'
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
                    className='mb-4 flex h-11 w-11 items-center justify-center rounded-[10px] border border-accent/20 bg-accent/10'
                    aria-hidden='true'
                  >
                    <Wallet className='h-5 w-5 text-accent-token' />
                  </div>
                  <h2 className='text-[17px] font-semibold tracking-[-0.011em] text-primary-token sm:text-lg'>
                    Connect Venmo to unlock earnings
                  </h2>
                  <p className='mt-2 text-app leading-5 text-secondary-token sm:text-sm'>
                    Link your Venmo once to start receiving payments and reveal
                    your full earnings dashboard.
                  </p>
                  <Button
                    onClick={() => setIsConnectOpen(true)}
                    variant='primary'
                    size='sm'
                    className='mt-5 rounded-[10px] text-2xs font-caption tracking-[-0.01em]'
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
                  <div className='grid grid-cols-2 gap-0 [&>*]:border-b [&>*]:border-[color-mix(in_oklab,var(--linear-app-shell-border)_72%,transparent)] sm:grid-cols-3 sm:[&>*]:border-b-0 sm:[&>*]:border-r sm:[&>*:last-child]:border-r-0'>
                    <StatCard
                      label='QR scans'
                      value={qrTipClicks}
                      description='Fans who scanned your QR'
                      icon={ScanLine}
                      iconChipClassName='border border-subtle bg-surface-1'
                      iconClassName='text-success'
                      bordered={false}
                    />
                    <StatCard
                      label='Link clicks'
                      value={linkTipClicks}
                      description='Fans who clicked your link'
                      icon={MousePointerClick}
                      iconChipClassName='border border-subtle bg-surface-1'
                      iconClassName='text-info'
                      bordered={false}
                    />
                    <StatCard
                      label='Total visits'
                      value={tipClicks}
                      description='QR + link combined'
                      icon={BarChart3}
                      iconChipClassName='border border-subtle bg-surface-1'
                      iconClassName='text-accent'
                      bordered={false}
                    />
                  </div>
                  <div className='border-t border-[color-mix(in_oklab,var(--linear-app-shell-border)_72%,transparent)] px-4 py-4 sm:border-l sm:border-t-0 sm:px-5'>
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
