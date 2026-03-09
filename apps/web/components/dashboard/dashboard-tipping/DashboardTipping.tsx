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
import { CopyToClipboardButton } from '@/components/dashboard/molecules/CopyToClipboardButton';
import { EarningsTab } from '@/components/dashboard/organisms/EarningsTab';
import {
  Dialog,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from '@/components/organisms/Dialog';
import { BASE_URL } from '@/constants/domains';
import { cn } from '@/lib/utils';
import { useDashboardTipping } from './useDashboardTipping';
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
}

const StatCard = memo(function StatCard({
  label,
  value,
  description,
  icon: Icon,
  iconChipClassName,
  iconClassName,
}: StatCardProps) {
  return (
    <section aria-label={`${label} metric`}>
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
          <dt className='text-[13px] font-[510] text-secondary-token'>
            {label}
          </dt>
        </div>
        <dd className='mt-2 text-2xl font-[590] tabular-nums leading-none tracking-[-0.011em] text-primary-token sm:text-3xl'>
          {formatCount(value)}
        </dd>
        <dd className='mt-1.5 text-[11px] leading-4 text-tertiary-token sm:text-[13px]'>
          {description}
        </dd>
      </dl>
    </section>
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
          className='inline-flex items-center gap-1.5 rounded-full border border-subtle bg-surface-1 px-2.5 py-1 text-[13px] font-[510] text-secondary-token transition-colors hover:bg-surface-2 sm:gap-2 sm:px-3 sm:py-1.5 sm:text-[14px]'
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
        <span className='text-[13px] text-secondary-token'>@</span>
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
          className='flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/10'
          aria-hidden='true'
        >
          <Wallet className='h-4.5 w-4.5 text-accent-token' />
        </div>
        <div className='min-w-0 flex-1'>
          <DialogTitle className='text-[15px] font-[590] tracking-[-0.011em] text-primary-token'>
            Connect Venmo
          </DialogTitle>
          <DialogDescription className='mt-0.5 text-[13px] leading-5 text-secondary-token'>
            Link your Venmo to start receiving tips from fans.
          </DialogDescription>
        </div>
      </div>

      <DialogBody>
        <div className='space-y-3'>
          <div>
            <label
              htmlFor='venmo-handle'
              className='mb-1.5 block text-[13px] font-[510] text-secondary-token'
            >
              Venmo Username
            </label>
            <div className='flex items-center gap-2'>
              <span className='text-[13px] text-tertiary-token'>@</span>
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
              className='flex items-center gap-2 rounded-lg bg-success-subtle px-3 py-2 text-[13px] font-[510] text-success'
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
    <div className='rounded-xl border border-subtle bg-surface-1 p-4 sm:p-5'>
      <div className='flex items-center gap-2 mb-3'>
        <div
          className='flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-info-subtle'
          aria-hidden='true'
        >
          <Link2 className='h-3.5 w-3.5 text-info' />
        </div>
        <h3 className='text-[13px] font-[510] text-primary-token'>Tip link</h3>
      </div>

      <div className='flex items-center gap-2 rounded-lg border border-subtle bg-surface-0 px-3 py-2.5'>
        <Copy className='hidden h-3.5 w-3.5 shrink-0 text-tertiary-token sm:block' />
        <span className='min-w-0 flex-1 truncate text-[13px] text-secondary-token'>
          {tipUrl}
        </span>
        <CopyToClipboardButton
          relativePath={tipRelativePathLink}
          idleLabel='Copy'
          successLabel='Copied'
          errorLabel='Failed'
          className='h-7 shrink-0 px-2.5 text-[13px]'
        />
      </div>
      <p className='mt-2 text-[11px] text-tertiary-token sm:text-[13px]'>
        Share this link anywhere to receive tips.
      </p>
    </div>
  );
});

// -----------------------------------------------------------------------------

// =============================================================================
// Main Component
// =============================================================================

export function DashboardTipping() {
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
  } = useDashboardTipping();

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
    const tipRelativePath = tipHandle ? `/${tipHandle}/tip` : '/tip';
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
    <div className='flex flex-col gap-6 pb-6'>
      {/* ── Page header ────────────────────────────────── */}
      <div className='space-y-3'>
        <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
          <div className='min-w-0'>
            <h1 className='text-xl font-[590] tracking-[-0.022em] text-primary-token sm:text-2xl'>
              Earnings
            </h1>
            <p className='mt-0.5 text-[13px] leading-5 text-secondary-token sm:text-[14px]'>
              Manage your payout method and track tip activity.
            </p>
          </div>

          {/* Venmo badge / edit form (connected state) */}
          {hasVenmoHandle && !isEditing && (
            <div className='shrink-0'>
              <VenmoConnectedBadge
                venmoHandle={artist.venmo_handle?.replace(/^@/, '') ?? ''}
                onEdit={() => {
                  setIsEditing(true);
                  setIsEditDialogOpen(true);
                }}
                onDisconnect={handleDisconnect}
              />
            </div>
          )}
        </div>

        {/* Edit Venmo dialog */}
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
      </div>

      {/* ── Connect Venmo (not connected) ──────────────── */}
      {!hasVenmoHandle && (
        <>
          <div className='rounded-xl border border-subtle bg-surface-1 p-4 sm:p-5'>
            <div className='flex items-center justify-between gap-3'>
              <div className='flex items-start gap-3'>
                <div
                  className='flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/10'
                  aria-hidden='true'
                >
                  <Wallet className='h-4.5 w-4.5 text-accent-token' />
                </div>
                <div className='min-w-0'>
                  <h3 className='text-[15px] font-[590] tracking-[-0.011em] text-primary-token'>
                    Connect Venmo
                  </h3>
                  <p className='mt-0.5 text-[13px] leading-5 text-secondary-token'>
                    Link your Venmo to start receiving tips from fans.
                  </p>
                </div>
              </div>
              <Button
                onClick={() => setIsConnectOpen(true)}
                variant='primary'
                size='sm'
              >
                Connect
              </Button>
            </div>
          </div>
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

      {/* ── Activity & Sharing (blurred when not connected) */}
      <div
        className={cn(
          'flex flex-col gap-5',
          !hasVenmoHandle && 'pointer-events-none select-none blur-sm'
        )}
        aria-hidden={!hasVenmoHandle || undefined}
        inert={!hasVenmoHandle || undefined}
      >
        {/* Section label */}
        <p className='text-[11px] font-[510] uppercase tracking-[0.08em] text-tertiary-token'>
          Activity
        </p>

        {/* Stat cards — 2 cols on mobile, 3 on sm+ */}
        <div className='grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4'>
          <StatCard
            label='QR scans'
            value={qrTipClicks}
            description='Fans who scanned your QR'
            icon={ScanLine}
            iconChipClassName='bg-success-subtle'
            iconClassName='text-success'
          />
          <StatCard
            label='Link clicks'
            value={linkTipClicks}
            description='Fans who clicked your link'
            icon={MousePointerClick}
            iconChipClassName='bg-info-subtle'
            iconClassName='text-info'
          />
          <StatCard
            label='Total visits'
            value={tipClicks}
            description='QR + link combined'
            icon={BarChart3}
            iconChipClassName='bg-accent-subtle'
            iconClassName='text-accent-token'
          />
        </div>

        {/* Sharing tools */}
        <p className='text-[11px] font-[510] uppercase tracking-[0.08em] text-tertiary-token'>
          Share
        </p>

        <div className='grid gap-4 sm:grid-cols-2'>
          <TipLinkSection
            tipUrl={tipUrls.tipUrl}
            tipRelativePathLink={tipUrls.tipRelativePathLink}
          />
        </div>

        {/* QR Code generation & download */}
        <EarningsTab />
      </div>
    </div>
  );
}
