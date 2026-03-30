'use client';

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  type SegmentControlOption,
} from '@jovie/ui';
import { Check, Link2Off, MoreHorizontal, Pencil, Wallet } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { AppSegmentControl } from '@/components/atoms/AppSegmentControl';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import {
  Dialog,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from '@/components/organisms/Dialog';
import { PageToolbar } from '@/components/organisms/table';
import { BASE_URL } from '@/constants/domains';
import { DashboardWorkspacePanel } from '@/features/dashboard/organisms/DashboardWorkspacePanel';
import { EarningsOverviewTab } from '@/features/dashboard/organisms/EarningsOverviewTab';
import { EarningsTippersTab } from '@/features/dashboard/organisms/EarningsTippersTab';
import { useEarningsQuery } from '@/lib/queries';
import { useDashboardTipping } from './useDashboardTipping';

// =============================================================================
// Constants
// =============================================================================

const EARNINGS_TABS = ['overview', 'tippers'] as const;
type EarningsTabValue = (typeof EARNINGS_TABS)[number];

const TAB_OPTIONS: readonly SegmentControlOption<EarningsTabValue>[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'tippers', label: 'Tippers' },
];

function isValidTab(value: string | null): value is EarningsTabValue {
  return value === 'overview' || value === 'tippers';
}

// =============================================================================
// Sub-components
// =============================================================================

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
        <DropdownMenuItem onSelect={onEdit}>
          <Pencil className='mr-2 h-3.5 w-3.5' />
          Edit
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant='destructive' onSelect={onDisconnect}>
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
          className='flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-accent/20 bg-accent/10'
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
              className='flex items-center gap-2 rounded-lg border border-subtle bg-surface-1 px-3 py-2 text-[13px] font-[510] text-success'
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

  // ── Tab state (URL-persisted) ──────────────────
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const rawTab = searchParams.get('tab');
  const activeTab: EarningsTabValue = isValidTab(rawTab) ? rawTab : 'overview';

  const handleTabChange = useCallback(
    (value: EarningsTabValue) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value === 'overview') {
        params.delete('tab');
      } else {
        params.set('tab', value);
      }
      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false });
    },
    [searchParams, router, pathname]
  );

  // ── Venmo dialog state ─────────────────────────
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

  // ── Derived data ───────────────────────────────
  const tipUrls = useMemo(() => {
    const tipHandle = artist?.handle ?? '';
    const tipRelativePath = tipHandle ? `/${tipHandle}/tip` : '/tip';
    const tipRelativePathLink = `${tipRelativePath}?source=link`;
    const tipUrl = `${BASE_URL}${tipRelativePathLink}`;
    return { tipRelativePathLink, tipUrl };
  }, [artist?.handle]);

  const { tipClicks, qrTipClicks, linkTipClicks } = dashboardData.tippingStats;

  // ── Earnings query (hoisted above tabs) ────────
  const { data: earnings, isLoading: isEarningsLoading } = useEarningsQuery(
    Boolean(artist)
  );

  if (!artist) {
    return null;
  }

  const toolbar =
    hasVenmoHandle && !isEditing ? (
      <PageToolbar
        start={null}
        end={
          <VenmoConnectedBadge
            venmoHandle={artist.venmo_handle?.replace(/^@/, '') ?? ''}
            onEdit={() => {
              setIsEditing(true);
              setIsEditDialogOpen(true);
            }}
            onDisconnect={handleDisconnect}
          />
        }
      />
    ) : undefined;

  return (
    <>
      <h1 className='sr-only'>Earnings Dashboard</h1>
      <DashboardWorkspacePanel
        toolbar={toolbar}
        data-testid='dashboard-earnings-workspace'
      >
        {!hasVenmoHandle && (
          <div className='flex-1 overflow-y-auto overflow-x-hidden'>
            <div className='flex flex-col gap-5 px-3 py-3 sm:px-4 sm:py-4'>
              <ContentSurfaceCard className='px-6 py-12 sm:px-8 sm:py-14'>
                <div className='mx-auto flex max-w-md flex-col items-center text-center'>
                  <div
                    className='mb-4 flex h-11 w-11 items-center justify-center rounded-[10px] border border-accent/20 bg-accent/10'
                    aria-hidden='true'
                  >
                    <Wallet className='h-5 w-5 text-accent-token' />
                  </div>
                  <h2 className='text-[17px] font-[590] tracking-[-0.011em] text-primary-token sm:text-[18px]'>
                    Connect Venmo to unlock earnings
                  </h2>
                  <p className='mt-2 text-[13px] leading-5 text-secondary-token sm:text-[14px]'>
                    Link your Venmo once to start receiving tips and reveal your
                    full earnings dashboard.
                  </p>
                  <Button
                    onClick={() => setIsConnectOpen(true)}
                    variant='primary'
                    size='sm'
                    className='mt-5 rounded-[10px] text-[11px] font-[510] tracking-[-0.01em]'
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
            </div>
          </div>
        )}

        {hasVenmoHandle && (
          <div className='flex min-h-0 flex-1 flex-col overflow-hidden'>
            {/* Tab bar */}
            <div className='shrink-0 border-b border-subtle px-3 py-2 sm:px-4'>
              <AppSegmentControl
                value={activeTab}
                onValueChange={handleTabChange}
                options={TAB_OPTIONS}
                surface='ghost'
              />
            </div>

            {/* Tab content */}
            {activeTab === 'overview' && (
              <div className='flex-1 overflow-hidden'>
                <EarningsOverviewTab
                  tipUrl={tipUrls.tipUrl}
                  tipRelativePathLink={tipUrls.tipRelativePathLink}
                  handle={artist.handle ?? ''}
                  earnings={earnings}
                  isEarningsLoading={isEarningsLoading}
                  qrTipClicks={qrTipClicks}
                  linkTipClicks={linkTipClicks}
                  tipClicks={tipClicks}
                />
              </div>
            )}

            {activeTab === 'tippers' && (
              <EarningsTippersTab
                tippers={earnings?.tippers ?? []}
                isLoading={isEarningsLoading}
              />
            )}
          </div>
        )}
      </DashboardWorkspacePanel>

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
