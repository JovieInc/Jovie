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
  const tipRelativePathLink = `${tipRelativePath}?source=link`;
  const tipShareUrlQr = `https://jov.ie${tipRelativePath}?source=qr`;
  const qrDisplaySize = 180;
  const qrDownloadSize = 420;
  const qrDownloadUrl = getQrCodeUrl(tipShareUrlQr, qrDownloadSize);
  const { tipClicks, qrTipClicks, linkTipClicks } = dashboardData.tippingStats;

  return (
    <div className='space-y-5'>
      <div className='flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between'>
        <div>
          <h1 className='text-2xl font-bold text-primary-token'>Earnings</h1>
          <p className='mt-1 text-secondary-token'>
            Connect your payout handle and view your earnings history
          </p>
        </div>
        {hasVenmoHandle ? (
          isEditing ? (
            <div className='flex flex-wrap items-center gap-2 rounded-xl border border-subtle bg-surface-1/40 px-3 py-2 shadow-none'>
              <WalletIcon className='h-4 w-4 text-accent' />
              <span className='text-sm font-medium text-primary-token'>
                Venmo
              </span>
              <div className='flex items-center gap-2'>
                <span className='text-sm text-secondary-token'>@</span>
                <Input
                  type='text'
                  value={venmoHandle}
                  onChange={e => setVenmoHandle(e.target.value)}
                  placeholder='your-username'
                  autoFocus
                  className='h-8 w-48 sm:w-56'
                />
              </div>
              <Button
                onClick={handleSaveVenmo}
                disabled={isSaving || !venmoHandle.trim()}
                variant='primary'
                size='sm'
                className='h-8 px-3'
              >
                {isSaving ? 'Saving…' : 'Update'}
              </Button>
              <Button
                onClick={handleCancel}
                disabled={isSaving}
                variant='ghost'
                size='sm'
                className='h-8 px-2'
              >
                Cancel
              </Button>
            </div>
          ) : (
            <div className='flex flex-wrap items-center gap-2 rounded-xl border border-subtle bg-surface-1/40 px-3 py-2 shadow-none'>
              <WalletIcon className='h-4 w-4 text-accent' />
              <span className='rounded-md bg-surface-2 px-2 py-1 font-sans text-sm text-primary-token'>
                {artist.venmo_handle}
              </span>
              <span className='text-sm text-secondary-token'>Connected</span>
              <Button
                onClick={() => setIsEditing(true)}
                variant='ghost'
                size='sm'
                className='h-8 px-2'
              >
                Edit
              </Button>
            </div>
          )
        ) : null}
      </div>

      {/* Venmo Handle Setup — hidden when already connected unless editing */}
      {!hasVenmoHandle ? (
        <div className='rounded-xl border border-subtle bg-surface-1/40 shadow-none'>
          <SectionHeader
            title='Venmo Handle'
            description='Your handle will appear on your profile so fans can tip you directly.'
            right={<WalletIcon className='h-6 w-6 text-accent' />}
            className='px-5 py-4 border-b border-subtle'
          />

          <div className='px-5 py-4'>
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
      ) : null}

      {/* Tipping content - Blurred and inert when no Venmo handle */}
      <div
        className={cn(
          'space-y-5',
          !hasVenmoHandle && 'filter blur-sm pointer-events-none select-none'
        )}
        aria-hidden={!hasVenmoHandle ? true : undefined}
        inert={hasVenmoHandle ? undefined : true}
      >
        <div className='grid gap-5 lg:grid-cols-12'>
          <div className='space-y-3 lg:col-span-12'>
            <div className='space-y-1'>
              <h2 className='text-base font-semibold tracking-tight text-primary-token'>
                Activity
              </h2>
              <p className='text-sm leading-6 text-secondary-token'>
                Track how fans reach your tipping page.
              </p>
            </div>

            <div className='grid grid-cols-1 gap-4 md:grid-cols-3'>
              <div className='rounded-xl border border-subtle bg-surface-1/40 p-4'>
                <p className='text-[11px] font-medium uppercase tracking-wide text-secondary-token'>
                  QR code scans
                </p>
                <p className='mt-2 text-3xl font-semibold tabular-nums tracking-tight text-primary-token'>
                  {formatCount(qrTipClicks)}
                </p>
                <p className='mt-2 text-xs leading-5 text-secondary-token'>
                  Fans who scanned your tip QR.
                </p>
              </div>
              <div className='rounded-xl border border-subtle bg-surface-1/40 p-4'>
                <p className='text-[11px] font-medium uppercase tracking-wide text-secondary-token'>
                  Link clicks
                </p>
                <p className='mt-2 text-3xl font-semibold tabular-nums tracking-tight text-primary-token'>
                  {formatCount(linkTipClicks)}
                </p>
                <p className='mt-2 text-xs leading-5 text-secondary-token'>
                  Fans who clicked your tip link.
                </p>
              </div>
              <div className='rounded-xl border border-subtle bg-surface-1/40 p-4'>
                <p className='text-[11px] font-medium uppercase tracking-wide text-secondary-token'>
                  Total
                </p>
                <p className='mt-2 text-3xl font-semibold tabular-nums tracking-tight text-primary-token'>
                  {formatCount(tipClicks)}
                </p>
                <p className='mt-2 text-xs leading-5 text-secondary-token'>
                  QR + link opens combined.
                </p>
              </div>
            </div>
          </div>

          <div className='grid gap-5 lg:col-span-12 lg:grid-cols-2'>
            <div className='rounded-xl border border-subtle bg-surface-1/40 shadow-none'>
              <SectionHeader
                title='Share your tip link'
                description='Send fans directly to jov.ie so they can tip instantly.'
                className='px-5 py-4 border-b border-subtle'
              />
              <div className='px-5 py-4'>
                <div className='space-y-3'>
                  <div className='flex flex-wrap items-center gap-3 rounded-lg border border-subtle bg-surface-2/60 px-3 py-2 text-sm font-sans text-primary-token'>
                    <span className='min-w-0 flex-1 truncate'>
                      https://jov.ie{tipRelativePathLink}
                    </span>
                    <CopyToClipboardButton
                      relativePath={tipRelativePathLink}
                      idleLabel='Copy link'
                      successLabel='Copied'
                      errorLabel='Copy failed'
                      className='h-8 px-3'
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

            <div className='rounded-xl border border-subtle bg-surface-1/40 shadow-none'>
              <SectionHeader
                title='Downloadable QR'
                description='Perfect for merch tables, receipts, or posters.'
                className='px-5 py-4 border-b border-subtle'
              />
              <div className='px-5 py-4'>
                <div className='flex flex-col items-center gap-3'>
                  <div className='w-full rounded-xl border border-subtle bg-surface-2/40 px-4 py-5'>
                    <QRCodeCard
                      data={tipShareUrlQr}
                      qrSize={qrDisplaySize}
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
                      Keep this on receipts or merch so fans can tip fast.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* Removed overlay CTA; wizard handles setup inline */}
    </div>
  );
}
