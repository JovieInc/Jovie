'use client';

import { Button, Input } from '@jovie/ui';
import {
  BarChart3,
  Check,
  Copy,
  Download,
  Link2,
  MousePointerClick,
  QrCode,
  ScanLine,
  Wallet,
  X,
} from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { CopyToClipboardButton } from '@/components/dashboard/molecules/CopyToClipboardButton';
import { QRCodeCard } from '@/components/molecules/QRCodeCard';
import { getQrCodeUrl } from '@/components/molecules/QRCodeDisplay';
import { BASE_URL } from '@/constants/domains';
import { cn } from '@/lib/utils';
import { useDashboardTipping } from './useDashboardTipping';
import { formatCount } from './utils';

// =============================================================================
// Constants
// =============================================================================

const QR_DISPLAY_SIZE = 160;
const QR_DOWNLOAD_SIZE = 420;

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
          <dt className='text-xs font-medium text-secondary-token'>{label}</dt>
        </div>
        <dd className='mt-2 text-2xl font-semibold tabular-nums leading-none tracking-tight text-primary-token sm:text-3xl'>
          {formatCount(value)}
        </dd>
        <dd className='mt-1.5 text-[11px] leading-4 text-tertiary-token sm:text-xs'>
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
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div className='flex items-center gap-2'>
      <button
        type='button'
        onClick={onEdit}
        className='inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent-token transition-colors hover:bg-accent/20 sm:gap-2 sm:px-3 sm:py-1.5 sm:text-sm'
      >
        <Wallet className='h-3.5 w-3.5 sm:h-4 sm:w-4' />
        <span className='truncate'>@{venmoHandle}</span>
      </button>

      <button
        type='button'
        onClick={onDisconnect}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className='inline-flex items-center gap-1 rounded-full border border-subtle bg-surface-1 px-2 py-1 text-[11px] font-medium transition-colors hover:border-error/50 hover:bg-error/10 hover:text-error sm:gap-1.5 sm:px-2.5 sm:text-xs'
      >
        {isHovered ? (
          <>
            <X className='h-3 w-3' />
            <span>Disconnect</span>
          </>
        ) : (
          <>
            <Check className='h-3 w-3 text-success' />
            <span className='text-secondary-token'>Connected</span>
          </>
        )}
      </button>
    </div>
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
    <div className='flex items-center gap-2 rounded-xl border border-subtle bg-surface-1 px-3 py-2 sm:gap-3 sm:px-4'>
      <Wallet className='hidden h-4 w-4 shrink-0 text-accent-token sm:block' />
      <div className='flex min-w-0 flex-1 items-center gap-1.5'>
        <span className='text-sm text-secondary-token'>@</span>
        <Input
          type='text'
          value={venmoHandle}
          onChange={e => onVenmoHandleChange(e.target.value)}
          placeholder='your-username'
          autoFocus
          className='h-8 min-w-0 flex-1'
        />
      </div>
      <div className='flex shrink-0 items-center gap-1.5'>
        <Button
          onClick={onSave}
          disabled={isSaving || !venmoHandle.trim()}
          variant='primary'
          size='sm'
          className='h-7 px-2.5 text-xs sm:h-8 sm:px-3'
        >
          {isSaving ? 'Saving…' : 'Save'}
        </Button>
        <Button
          onClick={onCancel}
          disabled={isSaving}
          variant='ghost'
          size='sm'
          className='h-7 px-2 text-xs sm:h-8'
        >
          Cancel
        </Button>
      </div>
    </div>
  );
});

// -----------------------------------------------------------------------------

interface VenmoConnectCardProps {
  readonly venmoHandle: string;
  readonly onVenmoHandleChange: (value: string) => void;
  readonly onSave: () => void;
  readonly isSaving: boolean;
  readonly saveSuccess: string | null;
}

const VenmoConnectCard = memo(function VenmoConnectCard({
  venmoHandle,
  onVenmoHandleChange,
  onSave,
  isSaving,
  saveSuccess,
}: VenmoConnectCardProps) {
  return (
    <div className='rounded-xl border border-subtle bg-surface-1 p-4 sm:p-5'>
      <div className='flex items-start gap-3'>
        <div
          className='flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/10'
          aria-hidden='true'
        >
          <Wallet className='h-4.5 w-4.5 text-accent-token' />
        </div>
        <div className='min-w-0 flex-1'>
          <h3 className='text-[15px] font-semibold tracking-tight text-primary-token'>
            Connect Venmo
          </h3>
          <p className='mt-0.5 text-xs leading-5 text-secondary-token sm:text-[13px]'>
            Link your Venmo to start receiving tips from fans.
          </p>
        </div>
      </div>

      <div className='mt-4 space-y-3'>
        <div>
          <label
            htmlFor='venmo-handle'
            className='mb-1.5 block text-xs font-medium text-secondary-token'
          >
            Venmo Username
          </label>
          <div className='flex items-center gap-2'>
            <span className='text-sm text-tertiary-token'>@</span>
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
        <Button
          onClick={onSave}
          disabled={isSaving || !venmoHandle.trim()}
          variant='primary'
          size='sm'
        >
          {isSaving ? 'Connecting…' : 'Connect'}
        </Button>
        {saveSuccess && (
          <output
            className='flex items-center gap-2 rounded-lg bg-success-subtle px-3 py-2 text-xs font-medium text-success'
            aria-live='polite'
          >
            <Check className='h-3.5 w-3.5' />
            {saveSuccess}
          </output>
        )}
      </div>
    </div>
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
        <h3 className='text-sm font-medium text-primary-token'>Tip link</h3>
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
          className='h-7 shrink-0 px-2.5 text-xs'
        />
      </div>
      <p className='mt-2 text-[11px] text-tertiary-token sm:text-xs'>
        Share this link anywhere to receive tips.
      </p>
    </div>
  );
});

// -----------------------------------------------------------------------------

interface QRCodeSectionProps {
  readonly tipShareUrlQr: string;
  readonly qrDownloadUrl: string;
  readonly displayHandle: string;
}

const QRCodeSection = memo(function QRCodeSection({
  tipShareUrlQr,
  qrDownloadUrl,
  displayHandle,
}: QRCodeSectionProps) {
  return (
    <div className='rounded-xl border border-subtle bg-surface-1 p-4 sm:p-5'>
      <div className='flex items-center gap-2 mb-4'>
        <div
          className='flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-subtle'
          aria-hidden='true'
        >
          <QrCode className='h-3.5 w-3.5 text-accent-token' />
        </div>
        <h3 className='text-sm font-medium text-primary-token'>QR code</h3>
      </div>

      <div className='flex flex-col items-center gap-4'>
        <div className='w-full rounded-xl bg-surface-0 p-4 sm:p-6'>
          <QRCodeCard
            data={tipShareUrlQr}
            qrSize={QR_DISPLAY_SIZE}
            title='Scan to tip'
            description='Opens your Jovie tip page.'
          />
        </div>
        <Button variant='secondary' size='sm' className='gap-2' asChild>
          <a
            href={qrDownloadUrl}
            download={`jovie-tip-${displayHandle}.png`}
            target='_blank'
            rel='noreferrer'
          >
            <Download className='h-3.5 w-3.5' />
            Download QR
          </a>
        </Button>
      </div>
    </div>
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

  const tipUrls = useMemo(() => {
    const tipHandle = artist?.handle ?? '';
    const displayHandle = tipHandle || 'your-handle';
    const tipRelativePath = tipHandle ? `/${tipHandle}/tip` : '/tip';
    const tipRelativePathLink = `${tipRelativePath}?source=link`;
    const tipShareUrlQr = `${BASE_URL}${tipRelativePath}?source=qr`;
    const tipUrl = `${BASE_URL}${tipRelativePathLink}`;
    const qrDownloadUrl = getQrCodeUrl(tipShareUrlQr, QR_DOWNLOAD_SIZE);

    return {
      displayHandle,
      tipRelativePathLink,
      tipShareUrlQr,
      tipUrl,
      qrDownloadUrl,
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
            <h1 className='text-xl font-semibold tracking-tight text-primary-token sm:text-2xl'>
              Earnings
            </h1>
            <p className='mt-0.5 text-[13px] leading-5 text-secondary-token sm:text-sm'>
              Manage your payout method and track tip activity.
            </p>
          </div>

          {/* Venmo badge / edit form (connected state) */}
          {hasVenmoHandle && !isEditing && (
            <div className='shrink-0'>
              <VenmoConnectedBadge
                venmoHandle={artist.venmo_handle?.replace(/^@/, '') ?? ''}
                onEdit={() => setIsEditing(true)}
                onDisconnect={handleDisconnect}
              />
            </div>
          )}
        </div>

        {/* Inline edit form */}
        {hasVenmoHandle && isEditing && (
          <VenmoEditForm
            venmoHandle={venmoHandle}
            onVenmoHandleChange={setVenmoHandle}
            onSave={handleSaveVenmo}
            onCancel={handleCancel}
            isSaving={isSaving}
          />
        )}
      </div>

      {/* ── Connect Venmo (not connected) ──────────────── */}
      {!hasVenmoHandle && (
        <VenmoConnectCard
          venmoHandle={venmoHandle}
          onVenmoHandleChange={setVenmoHandle}
          onSave={handleSaveVenmo}
          isSaving={isSaving}
          saveSuccess={saveSuccess}
        />
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
        <p className='text-[11px] font-semibold uppercase tracking-[0.2em] text-tertiary-token'>
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
        <p className='text-[11px] font-semibold uppercase tracking-[0.2em] text-tertiary-token'>
          Share
        </p>

        <div className='grid gap-4 sm:grid-cols-2'>
          <TipLinkSection
            tipUrl={tipUrls.tipUrl}
            tipRelativePathLink={tipUrls.tipRelativePathLink}
          />
          <QRCodeSection
            tipShareUrlQr={tipUrls.tipShareUrlQr}
            qrDownloadUrl={tipUrls.qrDownloadUrl}
            displayHandle={tipUrls.displayHandle}
          />
        </div>
      </div>
    </div>
  );
}
