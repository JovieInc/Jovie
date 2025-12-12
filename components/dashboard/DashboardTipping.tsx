'use client';

import { WalletIcon } from '@heroicons/react/24/outline';
import { Button } from '@jovie/ui';
import { useCallback, useState } from 'react';
import { useDashboardData } from '@/app/app/dashboard/DashboardDataContext';
import { Input } from '@/components/atoms/Input';
import { getQrCodeUrl } from '@/components/atoms/QRCode';
import { CopyToClipboardButton } from '@/components/dashboard/atoms/CopyToClipboardButton';
import { SectionHeader } from '@/components/dashboard/molecules/SectionHeader';
import { QRCodeCard } from '@/components/molecules/QRCodeCard';
import { cn } from '@/lib/utils';
import { Artist, convertDrizzleCreatorProfileToArtist } from '@/types/db';

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

const formatCurrency = (cents: number) => currencyFormatter.format(cents / 100);
const formatCount = (value: number) => value.toLocaleString();

export function DashboardTipping() {
  const dashboardData = useDashboardData();
  const [artist, setArtist] = useState<Artist | null>(
    dashboardData.selectedProfile
      ? convertDrizzleCreatorProfileToArtist(dashboardData.selectedProfile)
      : null
  );
  const [venmoHandle, setVenmoHandle] = useState(
    artist?.venmo_handle?.replace(/^@/, '') || ''
  );
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  // Note: Profile switching functionality will be implemented in the future

  const handleSaveVenmo = useCallback(async () => {
    if (!artist) return;

    setIsSaving(true);
    try {
      const response = await fetch('/api/dashboard/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          updates: {
            venmo_handle: venmoHandle ? `@${venmoHandle}` : '',
          },
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update Venmo handle');
      }

      const normalizedHandle = venmoHandle ? `@${venmoHandle}` : '';
      const updatedArtist = { ...artist, venmo_handle: normalizedHandle };
      setArtist(updatedArtist);
      setIsEditing(false);
      setSaveSuccess(`Connected to ${normalizedHandle}`);
      // Clear success after a short delay
      setTimeout(() => setSaveSuccess(null), 2500);
    } catch (error) {
      console.error('Failed to update Venmo handle:', error);
    } finally {
      setIsSaving(false);
    }
  }, [venmoHandle, artist]);

  const handleCancel = () => {
    if (!artist) return;
    setVenmoHandle(artist.venmo_handle?.replace(/^@/, '') || '');
    setIsEditing(false);
  };

  if (!artist) {
    return null; // This shouldn't happen given the server-side logic
  }

  const hasVenmoHandle = Boolean(artist.venmo_handle);
  const tipHandle = artist.handle ?? '';
  const displayHandle = tipHandle || 'your-handle';
  const tipRelativePath = tipHandle ? `/${tipHandle}/tip` : '/tip';
  const tipShareUrl = `https://jov.ie${tipRelativePath}`;
  const qrDisplaySize = 180;
  const qrDownloadSize = 420;
  const qrDownloadUrl = getQrCodeUrl(tipShareUrl, qrDownloadSize);
  const { totalReceivedCents, monthReceivedCents, tipClicks, tipsSubmitted } =
    dashboardData.tippingStats;

  return (
    <div className='space-y-6'>
      <div>
        <h1 className='text-2xl font-bold text-primary-token'>Earnings</h1>
        <p className='mt-1 text-secondary-token'>
          Connect your payout handle and view your earnings history
        </p>
      </div>

      {/* Venmo Handle Setup — hidden when already connected unless editing */}
      {hasVenmoHandle && !isEditing ? (
        <div className='flex items-center justify-between rounded-lg border border-subtle bg-surface-1 px-4 py-3 shadow-sm'>
          <div className='flex items-center gap-2 text-sm text-primary-token'>
            <WalletIcon className='h-5 w-5 text-accent' />
            <span className='font-mono rounded-md bg-surface-2 px-2 py-1'>
              {artist.venmo_handle}
            </span>
            <span className='text-secondary-token'>Connected</span>
          </div>
          <Button onClick={() => setIsEditing(true)} variant='ghost' size='sm'>
            Edit
          </Button>
        </div>
      ) : (
        <div className='w-full overflow-hidden rounded-xl border border-subtle bg-surface-1 shadow-sm'>
          <SectionHeader
            title='Venmo Handle'
            description='Your handle will appear on your profile so fans can tip you directly.'
            right={<WalletIcon className='h-6 w-6 text-accent' />}
          />

          <div className='px-6 pb-6'>
            <div className='space-y-4'>
              <div>
                <label
                  htmlFor='venmo-handle'
                  className='mb-2 block text-sm font-medium text-primary-token'
                >
                  Venmo Username
                </label>
                <div className='flex items-center gap-2'>
                  <span className='text-sm text-secondary-token'>@</span>
                  <Input
                    type='text'
                    id='venmo-handle'
                    value={venmoHandle}
                    onChange={e => setVenmoHandle(e.target.value)}
                    placeholder='your-username'
                    autoFocus
                    className='flex-1'
                  />
                </div>
                <p className='mt-2 text-xs text-secondary-token'>
                  Your handle will be shown on your public profile and fans can
                  tip you directly via Venmo.
                </p>
              </div>
              <div className='flex gap-3'>
                <Button
                  onClick={handleSaveVenmo}
                  disabled={isSaving || !venmoHandle.trim()}
                  variant='primary'
                  size='sm'
                >
                  {isSaving
                    ? 'Saving...'
                    : hasVenmoHandle
                      ? 'Update'
                      : 'Connect'}
                </Button>
                {hasVenmoHandle ? (
                  <Button
                    onClick={handleCancel}
                    disabled={isSaving}
                    variant='ghost'
                    size='sm'
                  >
                    Cancel
                  </Button>
                ) : null}
              </div>
              {saveSuccess && (
                <div
                  className='rounded-lg border border-subtle bg-surface-2 px-3 py-2 text-sm text-primary-token'
                  role='status'
                  aria-live='polite'
                >
                  ✓ {saveSuccess}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tipping content - Blurred and inert when no Venmo handle */}
      <div
        className={cn(
          'space-y-6',
          !hasVenmoHandle && 'filter blur-sm pointer-events-none select-none'
        )}
        aria-hidden={!hasVenmoHandle ? true : undefined}
        inert={hasVenmoHandle ? undefined : true}
      >
        <div className='grid gap-6 lg:grid-cols-[1.45fr_1fr]'>
          <div className='w-full overflow-hidden rounded-xl border border-subtle bg-surface-1 shadow-sm'>
            <SectionHeader
              title='Earnings Summary'
              description='Track what fans have contributed via Venmo tips.'
            />
            <div className='px-6 pb-6'>
              <div className='grid grid-cols-1 gap-4 md:grid-cols-3'>
                <div className='rounded-lg border border-subtle bg-surface-2/60 p-4'>
                  <p className='text-sm text-secondary-token'>Total Received</p>
                  <p className='text-2xl font-bold text-primary-token'>
                    {formatCurrency(totalReceivedCents)}
                  </p>
                </div>
                <div className='rounded-lg border border-subtle bg-surface-2/60 p-4'>
                  <p className='text-sm text-secondary-token'>This Month</p>
                  <p className='text-2xl font-bold text-primary-token'>
                    {formatCurrency(monthReceivedCents)}
                  </p>
                </div>
                <div className='rounded-lg border border-subtle bg-surface-2/60 p-4'>
                  <p className='text-sm text-secondary-token'>Tips Received</p>
                  <p className='text-2xl font-bold text-primary-token'>
                    {formatCount(tipsSubmitted)}
                  </p>
                </div>
              </div>
              <div className='mt-4 grid grid-cols-1 gap-4 md:grid-cols-2'>
                <div className='rounded-lg border border-subtle bg-surface-2/60 p-4'>
                  <p className='text-sm text-secondary-token'>
                    Tip link clicks &amp; QR scans
                  </p>
                  <p className='text-2xl font-bold text-primary-token'>
                    {formatCount(tipClicks)}
                  </p>
                  <p className='mt-1 text-xs text-secondary-token'>
                    Shows how many times fans opened your tipping page.
                  </p>
                </div>
                <div className='rounded-lg border border-subtle bg-surface-2/60 p-4'>
                  <p className='text-sm text-secondary-token'>Tips submitted</p>
                  <p className='text-2xl font-bold text-primary-token'>
                    {formatCount(tipsSubmitted)}
                  </p>
                  <p className='mt-1 text-xs text-secondary-token'>
                    Venmo conversions captured on Jovie.
                  </p>
                </div>
              </div>
            </div>
          </div>
          <div className='space-y-6'>
            <div className='w-full overflow-hidden rounded-xl border border-subtle bg-surface-1 shadow-sm'>
              <SectionHeader
                title='Share your tip link'
                description='Send fans directly to jov.ie so they can tip instantly.'
              />
              <div className='px-6 pb-6'>
                <div className='space-y-3'>
                  <div className='flex flex-wrap items-center gap-3 rounded-lg border border-subtle bg-surface-2 px-4 py-2 text-sm font-mono text-primary-token'>
                    <span className='min-w-0 flex-1 truncate'>
                      {tipShareUrl}
                    </span>
                    <CopyToClipboardButton
                      relativePath={tipRelativePath}
                      idleLabel='Copy link'
                      successLabel='✓ Copied!'
                      errorLabel='Copy failed'
                    />
                  </div>
                  <p className='text-xs text-secondary-token'>
                    Fans can visit{' '}
                    <strong className='font-semibold'>
                      jov.ie/{displayHandle}/tip
                    </strong>{' '}
                    or scan the QR code below to tip you instantly.
                  </p>
                </div>
              </div>
            </div>
            <div className='w-full overflow-hidden rounded-xl border border-subtle bg-surface-1 shadow-sm'>
              <SectionHeader
                title='Downloadable QR'
                description='Perfect for merch tables, receipts, or posters.'
              />
              <div className='px-6 pb-6'>
                <div className='flex flex-col items-center gap-3'>
                  <QRCodeCard
                    data={tipShareUrl}
                    qrSize={qrDisplaySize}
                    title='Scan to tip'
                    description='Opens your Jovie tip page.'
                  />
                  <div className='flex flex-wrap items-center justify-center gap-3'>
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
                      Keep this on receipts or merch so fans can tip fast.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className='w-full overflow-hidden rounded-xl border border-subtle bg-surface-1 shadow-sm'>
          <SectionHeader title='Recent Earnings' />
          <div className='px-6 pb-6'>
            <div className='space-y-3'>
              <p className='text-secondary-token'>
                No earnings yet. When you receive tips, they&apos;ll appear
                here.
              </p>
              <p className='text-xs text-secondary-token'>
                Soon you can forward Venmo receipts to us to tie every
                conversion back to your dashboard.
              </p>
            </div>
          </div>
        </div>
      </div>
      {/* Removed overlay CTA; wizard handles setup inline */}
    </div>
  );
}
