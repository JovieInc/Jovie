'use client';

import {
  BarChart3,
  Check,
  Copy,
  DollarSign,
  FileCode2,
  FileImage,
  Hash,
  Link2,
  MousePointerClick,
  QrCode,
  ScanLine,
  TrendingUp,
} from 'lucide-react';
import Image from 'next/image';
import { memo, useCallback, useEffect, useState } from 'react';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { DrawerButton, DrawerSurfaceCard } from '@/components/molecules/drawer';
import { CopyToClipboardButton } from '@/features/dashboard/molecules/CopyToClipboardButton';
import { useClipboard } from '@/hooks/useClipboard';
import { useNotifications } from '@/lib/hooks/useNotifications';
import type { EarningsResponse } from '@/lib/queries';
import { downloadBlob, downloadString } from '@/lib/utils/download';
import { generateQrCodeDataUrl, generateQrCodeSvg } from '@/lib/utils/qr-code';
import { EarningsStatCard } from '../atoms/EarningsStatCard';

// =============================================================================
// Constants
// =============================================================================

const QR_DISPLAY_SIZE = 120;
const QR_PRINT_SIZE = 1024;
const STATS_SKELETON_KEYS = [
  'stats-skeleton-1',
  'stats-skeleton-2',
  'stats-skeleton-3',
  'stats-skeleton-4',
  'stats-skeleton-5',
  'stats-skeleton-6',
] as const;

// =============================================================================
// Helpers
// =============================================================================

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// =============================================================================
// Sub-components
// =============================================================================

interface QrPreviewProps {
  readonly dataUrl: string | null;
  readonly isLoading: boolean;
}

const QrPreview = memo(function QrPreview({
  dataUrl,
  isLoading,
}: QrPreviewProps) {
  if (isLoading || !dataUrl) {
    return (
      <div
        className='flex items-center justify-center rounded-lg bg-white'
        style={{ width: QR_DISPLAY_SIZE, height: QR_DISPLAY_SIZE }}
        aria-hidden='true'
      >
        <div className='h-10 w-10 rounded-md bg-gray-200 animate-pulse motion-reduce:animate-none' />
      </div>
    );
  }

  return (
    <Image
      src={dataUrl}
      alt='QR code for tip page'
      width={QR_DISPLAY_SIZE}
      height={QR_DISPLAY_SIZE}
      className='rounded-lg'
      unoptimized
    />
  );
});

// =============================================================================
// Main Component
// =============================================================================

interface EarningsOverviewTabProps {
  readonly tipUrl: string;
  readonly tipRelativePathLink: string;
  readonly handle: string;
  readonly earnings: EarningsResponse | undefined;
  readonly isEarningsLoading: boolean;
  readonly qrTipClicks: number;
  readonly linkTipClicks: number;
  readonly tipClicks: number;
}

export function EarningsOverviewTab({
  tipUrl,
  tipRelativePathLink,
  handle,
  earnings,
  isEarningsLoading,
  qrTipClicks,
  linkTipClicks,
  tipClicks,
}: EarningsOverviewTabProps) {
  const notifications = useNotifications();
  const stats = earnings?.stats;

  // ── QR generation ──────────────────────────────
  const [displayDataUrl, setDisplayDataUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    if (!tipUrl) {
      setDisplayDataUrl(null);
      return;
    }

    let cancelled = false;
    setIsGenerating(true);

    generateQrCodeDataUrl(tipUrl, QR_DISPLAY_SIZE * 2).then(
      url => {
        if (!cancelled) {
          setDisplayDataUrl(url);
          setIsGenerating(false);
        }
      },
      () => {
        if (!cancelled) {
          setIsGenerating(false);
        }
      }
    );

    return () => {
      cancelled = true;
    };
  }, [tipUrl]);

  // ── Download handlers ──────────────────────────
  const [isDownloadingPng, setIsDownloadingPng] = useState(false);
  const [isDownloadingSvg, setIsDownloadingSvg] = useState(false);

  const handleDownloadPng = useCallback(async () => {
    if (!tipUrl) return;
    setIsDownloadingPng(true);
    try {
      const dataUrl = await generateQrCodeDataUrl(tipUrl, QR_PRINT_SIZE);
      const response = await fetch(dataUrl);
      const blob = await response.blob();
      downloadBlob(blob, `jovie-tip-${handle}.png`);
      notifications.success('PNG downloaded');
    } catch {
      notifications.error('Failed to generate PNG');
    } finally {
      setIsDownloadingPng(false);
    }
  }, [tipUrl, handle, notifications]);

  const handleDownloadSvg = useCallback(async () => {
    if (!tipUrl) return;
    setIsDownloadingSvg(true);
    try {
      const svgString = await generateQrCodeSvg(tipUrl, QR_PRINT_SIZE);
      downloadString(svgString, {
        filename: `jovie-tip-${handle}.svg`,
        mimeType: 'image/svg+xml',
      });
      notifications.success('SVG downloaded');
    } catch {
      notifications.error('Failed to generate SVG');
    } finally {
      setIsDownloadingSvg(false);
    }
  }, [tipUrl, handle, notifications]);

  // ── Copy link ──────────────────────────────────
  const { copy, isSuccess: isCopySuccess } = useClipboard({
    onSuccess: () =>
      notifications.success('Tip link copied', { duration: 2000 }),
    onError: () => notifications.error('Failed to copy link'),
  });

  const handleCopyLink = useCallback(() => {
    if (!tipUrl) return;
    copy(tipUrl);
  }, [tipUrl, copy]);

  const statsSkeleton = (
    <div className='grid grid-cols-2 gap-2 sm:grid-cols-3'>
      {STATS_SKELETON_KEYS.map(key => (
        <ContentSurfaceCard key={key} className='space-y-2 p-2.5'>
          <div className='flex items-center gap-2'>
            <div className='h-7 w-7 rounded-md skeleton' />
            <div className='h-3 w-16 rounded-sm skeleton' />
          </div>
          <div className='h-7 w-20 rounded-md skeleton' />
          <div className='h-3 w-24 rounded-sm skeleton' />
        </ContentSurfaceCard>
      ))}
    </div>
  );

  return (
    <div className='flex h-full min-h-0 flex-col gap-3 px-3 py-3 sm:px-4 sm:py-4'>
      <ContentSurfaceCard className='shrink-0 p-3'>
        <div className='flex items-center gap-2 rounded-[10px] border border-(--linear-app-frame-seam) bg-surface-0 px-3 py-2'>
          <Copy className='max-sm:hidden h-3.5 w-3.5 shrink-0 text-tertiary-token' />
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
        <p className='mt-1.5 text-[11px] text-tertiary-token sm:text-[13px]'>
          Share this link anywhere to receive tips.
        </p>
      </ContentSurfaceCard>

      <div className='grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.95fr)]'>
        <ContentSurfaceCard className='flex min-h-0 flex-col p-3'>
          <div className='mb-3'>
            <h2 className='text-[13px] font-[510] text-primary-token'>
              Performance snapshot
            </h2>
            <p className='text-[11px] text-tertiary-token sm:text-[12px]'>
              Revenue and traffic at a glance.
            </p>
          </div>

          {isEarningsLoading ? (
            statsSkeleton
          ) : (
            <div className='flex flex-1 flex-col gap-3 xl:justify-between'>
              <div>
                <p className='mb-2 text-[12px] font-[510] tracking-normal text-secondary-token'>
                  Revenue
                </p>
                <dl className='grid grid-cols-2 gap-2 sm:grid-cols-3'>
                  <EarningsStatCard
                    label='Total revenue'
                    value={formatCents(stats?.totalRevenueCents ?? 0)}
                    icon={DollarSign}
                    iconClassName='text-success'
                  />
                  <EarningsStatCard
                    label='Tips received'
                    value={String(stats?.totalTips ?? 0)}
                    icon={Hash}
                    iconClassName='text-info'
                  />
                  <EarningsStatCard
                    label='Average tip'
                    value={formatCents(stats?.averageTipCents ?? 0)}
                    icon={TrendingUp}
                    iconClassName='text-accent'
                  />
                </dl>
              </div>

              <div>
                <p className='mb-2 text-[12px] font-[510] tracking-normal text-secondary-token'>
                  Traffic
                </p>
                <dl className='grid grid-cols-2 gap-2 sm:grid-cols-3'>
                  <EarningsStatCard
                    label='QR scans'
                    value={formatCount(qrTipClicks)}
                    description='Fans who scanned your QR'
                    icon={ScanLine}
                    iconClassName='text-success'
                  />
                  <EarningsStatCard
                    label='Link clicks'
                    value={formatCount(linkTipClicks)}
                    description='Fans who clicked your link'
                    icon={MousePointerClick}
                    iconClassName='text-info'
                  />
                  <EarningsStatCard
                    label='Total visits'
                    value={formatCount(tipClicks)}
                    description='QR + link combined'
                    icon={BarChart3}
                    iconClassName='text-accent'
                  />
                </dl>
              </div>
            </div>
          )}
        </ContentSurfaceCard>

        {handle && (
          <ContentSurfaceCard className='flex min-h-0 flex-col p-3'>
            <div className='mb-3 flex items-center gap-2'>
              <div
                className='flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-subtle bg-surface-1'
                aria-hidden='true'
              >
                <QrCode className='h-3.5 w-3.5 text-accent' />
              </div>
              <div>
                <h2 className='text-[13px] font-[510] text-primary-token'>
                  Tip QR code
                </h2>
                <p className='text-[11px] text-tertiary-token sm:text-[12px]'>
                  Share, print, or download assets.
                </p>
              </div>
            </div>

            <div className='flex flex-1 flex-col items-center justify-between gap-3 lg:flex-row xl:flex-col xl:items-stretch'>
              <div className='flex justify-center rounded-lg bg-white p-1.5'>
                <QrPreview dataUrl={displayDataUrl} isLoading={isGenerating} />
              </div>

              <div className='flex w-full flex-col gap-2.5'>
                <DrawerSurfaceCard className='flex items-center gap-2 rounded-md bg-surface-0 px-2.5 py-2'>
                  <Link2 className='h-3.5 w-3.5 shrink-0 text-tertiary-token' />
                  <span className='min-w-0 flex-1 truncate text-[13px] text-secondary-token'>
                    {tipUrl}
                  </span>
                </DrawerSurfaceCard>

                <div className='grid gap-2 sm:grid-cols-3 xl:grid-cols-2'>
                  <DrawerButton
                    tone='secondary'
                    size='sm'
                    className='gap-2'
                    onClick={handleDownloadPng}
                    disabled={isDownloadingPng}
                  >
                    <FileImage className='h-3.5 w-3.5' />
                    {isDownloadingPng ? 'Generating...' : 'PNG'}
                  </DrawerButton>

                  <DrawerButton
                    tone='secondary'
                    size='sm'
                    className='gap-2'
                    onClick={handleDownloadSvg}
                    disabled={isDownloadingSvg}
                  >
                    <FileCode2 className='h-3.5 w-3.5' />
                    {isDownloadingSvg ? 'Generating...' : 'SVG'}
                  </DrawerButton>

                  <DrawerButton
                    tone='ghost'
                    size='sm'
                    className='gap-2 sm:col-span-3 xl:col-span-2'
                    onClick={handleCopyLink}
                  >
                    {isCopySuccess ? (
                      <Check className='h-3.5 w-3.5 text-success' />
                    ) : (
                      <Copy className='h-3.5 w-3.5' />
                    )}
                    {isCopySuccess ? 'Copied' : 'Copy link'}
                  </DrawerButton>
                </div>
              </div>
            </div>
          </ContentSurfaceCard>
        )}
      </div>
    </div>
  );
}
