'use client';

import { Button, Input } from '@jovie/ui';
import { Check, Wallet, X } from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { CopyToClipboardButton } from '@/components/dashboard/atoms/CopyToClipboardButton';
import { SectionHeader } from '@/components/dashboard/molecules/SectionHeader';
import { getQrCodeUrl } from '@/components/molecules/QRCode';
import { QRCodeCard } from '@/components/molecules/QRCodeCard';
import { BASE_URL } from '@/constants/domains';
import { cn } from '@/lib/utils';
import { useDashboardTipping } from './useDashboardTipping';
import { formatCount } from './utils';

// =============================================================================
// Constants
// =============================================================================

const QR_DISPLAY_SIZE = 180;
const QR_DOWNLOAD_SIZE = 420;

// =============================================================================
// Sub-components
// =============================================================================

interface StatCardProps {
  readonly label: string;
  readonly value: number;
  readonly description: string;
}

const StatCard = memo(function StatCard({
  label,
  value,
  description,
}: StatCardProps) {
  return (
    <div className='rounded-xl bg-surface-1 p-5'>
      <p className='text-xs font-medium text-tertiary-token'>{label}</p>
      <p className='mt-3 text-2xl font-semibold tabular-nums tracking-tight text-primary-token'>
        {formatCount(value)}
      </p>
      <p className='mt-2 text-xs text-secondary-token'>{description}</p>
    </div>
  );
});

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
    <div className='flex flex-wrap items-center gap-3'>
      {/* Venmo handle pill with edit on click */}
      <button
        type='button'
        onClick={onEdit}
        className='inline-flex items-center gap-2 rounded-full bg-accent/10 px-3 py-1.5 text-sm font-medium text-accent-token transition-colors hover:bg-accent/20'
      >
        <Wallet className='h-4 w-4' />@{venmoHandle}
      </button>

      {/* Connected pill with hover disconnect */}
      <button
        type='button'
        onClick={onDisconnect}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className='group inline-flex items-center gap-1.5 rounded-full border border-subtle bg-surface-1 px-2.5 py-1 text-xs font-medium transition-colors hover:border-error/50 hover:bg-error/10 hover:text-error'
      >
        {isHovered ? (
          <>
            <X className='h-3.5 w-3.5' />
            <span>Disconnect</span>
          </>
        ) : (
          <>
            <Check className='h-3.5 w-3.5 text-success' />
            <span className='text-secondary-token'>Connected</span>
          </>
        )}
      </button>
    </div>
  );
});

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
    <div className='flex flex-wrap items-center gap-3 rounded-xl bg-surface-1 px-4 py-2.5'>
      <Wallet className='h-4 w-4 text-accent-token' />
      <span className='text-sm font-medium text-primary-token'>Venmo</span>
      <div className='flex items-center gap-2'>
        <span className='text-sm text-secondary-token'>@</span>
        <Input
          type='text'
          value={venmoHandle}
          onChange={e => onVenmoHandleChange(e.target.value)}
          placeholder='your-username'
          autoFocus
          className='h-8 w-48 sm:w-56'
        />
      </div>
      <Button
        onClick={onSave}
        disabled={isSaving || !venmoHandle.trim()}
        variant='primary'
        size='sm'
        className='h-8 px-3'
      >
        {isSaving ? 'Saving…' : 'Update'}
      </Button>
      <Button
        onClick={onCancel}
        disabled={isSaving}
        variant='ghost'
        size='sm'
        className='h-8 px-2'
      >
        Cancel
      </Button>
    </div>
  );
});

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
  const buttonText = isSaving ? 'Saving...' : 'Connect';

  return (
    <div className='space-y-4'>
      <SectionHeader
        title='Venmo Handle'
        description='Connect your Venmo to receive tips from fans.'
        right={<Wallet className='h-6 w-6 text-accent' />}
        className='pb-1'
      />

      <div>
        <div className='space-y-4'>
          <div>
            <label
              htmlFor='venmo-handle'
              className='mb-1.5 block text-sm font-medium text-primary-token'
            >
              Venmo Username
            </label>
            <div className='flex items-center gap-2'>
              <span className='text-sm text-secondary-token'>@</span>
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
            <p className='mt-1.5 text-xs text-tertiary-token'>
              Shown on your public profile.
            </p>
          </div>
          <div className='flex gap-3'>
            <Button
              onClick={onSave}
              disabled={isSaving || !venmoHandle.trim()}
              variant='primary'
              size='sm'
            >
              {buttonText}
            </Button>
          </div>
          {saveSuccess && (
            <output
              className='flex items-center gap-2 rounded-lg bg-green-500/10 px-3 py-2 text-sm font-medium text-green-600 dark:text-green-400'
              aria-live='polite'
            >
              ✓ {saveSuccess}
            </output>
          )}
        </div>
      </div>
    </div>
  );
});

interface TipLinkSectionProps {
  readonly tipUrl: string;
  readonly tipRelativePathLink: string;
  readonly displayHandle: string;
}

const TipLinkSection = memo(function TipLinkSection({
  tipUrl,
  tipRelativePathLink,
  displayHandle,
}: TipLinkSectionProps) {
  return (
    <div className='space-y-4'>
      <SectionHeader
        title='Share your tip link'
        description='Direct fans to your tip page.'
        className='pb-1'
      />
      <div>
        <div className='space-y-3'>
          <div className='flex items-center gap-3 rounded-lg border border-subtle bg-surface-2 px-4 py-3 text-sm text-primary-token'>
            <span className='min-w-0 flex-1 truncate'>{tipUrl}</span>
            <CopyToClipboardButton
              relativePath={tipRelativePathLink}
              idleLabel='Copy link'
              successLabel='Copied'
              errorLabel='Copy failed'
              className='h-8 px-3'
            />
          </div>
          <p className='text-xs text-secondary-token'>
            Share this link or use the QR code below.
          </p>
        </div>
      </div>
    </div>
  );
});

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
    <div className='space-y-4'>
      <SectionHeader
        title='Downloadable QR'
        description='Print for merch, receipts, or posters.'
        className='pb-1'
      />
      <div>
        <div className='flex flex-col items-center gap-3'>
          <div className='w-full rounded-xl bg-surface-2 p-6'>
            <QRCodeCard
              data={tipShareUrlQr}
              qrSize={QR_DISPLAY_SIZE}
              title='Scan to tip'
              description='Opens your Jovie tip page.'
            />
          </div>
          <div className='flex flex-col items-center justify-center gap-2 text-center'>
            <Button variant='secondary' size='sm' asChild>
              <a
                href={qrDownloadUrl}
                download={`jovie-tip-${displayHandle}.png`}
                target='_blank'
                rel='noreferrer'
              >
                Download QR
              </a>
            </Button>
            <p className='text-xs text-secondary-token'>
              Scans open your tip page instantly.
            </p>
          </div>
        </div>
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

  // Memoize URL calculations
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
    <div className='space-y-6'>
      {/* Header */}
      <div className='flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between'>
        <div>
          <h1 className='text-2xl font-semibold tracking-tight text-primary-token'>
            Earnings
          </h1>
          <p className='mt-1 text-sm text-secondary-token'>
            Connect your payout handle and view your earnings history
          </p>
        </div>
        {hasVenmoHandle &&
          (isEditing ? (
            <VenmoEditForm
              venmoHandle={venmoHandle}
              onVenmoHandleChange={setVenmoHandle}
              onSave={handleSaveVenmo}
              onCancel={handleCancel}
              isSaving={isSaving}
            />
          ) : (
            <VenmoConnectedBadge
              venmoHandle={artist.venmo_handle?.replace(/^@/, '') ?? ''}
              onEdit={() => setIsEditing(true)}
              onDisconnect={handleDisconnect}
            />
          ))}
      </div>

      {/* Venmo Connect Card (shown when not connected) */}
      {!hasVenmoHandle && (
        <VenmoConnectCard
          venmoHandle={venmoHandle}
          onVenmoHandleChange={setVenmoHandle}
          onSave={handleSaveVenmo}
          isSaving={isSaving}
          saveSuccess={saveSuccess}
        />
      )}

      {/* Activity & Sharing Section (blurred when not connected) */}
      <div
        className={cn(
          'space-y-6',
          !hasVenmoHandle && 'pointer-events-none select-none blur-sm'
        )}
        aria-hidden={!hasVenmoHandle || undefined}
        inert={!hasVenmoHandle || undefined}
      >
        <div className='grid gap-6 lg:grid-cols-12'>
          {/* Activity Stats */}
          <div className='space-y-4 lg:col-span-12'>
            <div className='space-y-1'>
              <h2 className='text-lg font-medium text-primary-token'>
                Activity
              </h2>
              <p className='text-sm text-secondary-token'>
                Track how fans reach your tipping page.
              </p>
            </div>

            <div className='grid grid-cols-1 gap-5 sm:grid-cols-3'>
              <StatCard
                label='QR code scans'
                value={qrTipClicks}
                description='Fans who scanned your tip QR.'
              />
              <StatCard
                label='Link clicks'
                value={linkTipClicks}
                description='Fans who clicked your tip link.'
              />
              <StatCard
                label='Total'
                value={tipClicks}
                description='QR + link opens combined.'
              />
            </div>
          </div>

          {/* Tip Link & QR Code Sections */}
          <div className='grid gap-6 lg:col-span-12 lg:grid-cols-2'>
            <TipLinkSection
              tipUrl={tipUrls.tipUrl}
              tipRelativePathLink={tipUrls.tipRelativePathLink}
              displayHandle={tipUrls.displayHandle}
            />
            <QRCodeSection
              tipShareUrlQr={tipUrls.tipShareUrlQr}
              qrDownloadUrl={tipUrls.qrDownloadUrl}
              displayHandle={tipUrls.displayHandle}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
