'use client';

import { Button } from '@jovie/ui';
import {
  Check,
  Copy,
  DollarSign,
  FileCode2,
  FileImage,
  Hash,
  Link2,
  QrCode,
  TrendingUp,
  Users,
} from 'lucide-react';
import Image from 'next/image';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { BASE_URL } from '@/constants/domains';
import { useClipboard } from '@/hooks/useClipboard';
import { useNotifications } from '@/lib/hooks/useNotifications';
import { useEarningsQuery } from '@/lib/queries/useEarningsQuery';
import { downloadBlob, downloadString } from '@/lib/utils/download';
import { generateQrCodeDataUrl, generateQrCodeSvg } from '@/lib/utils/qr-code';

// =============================================================================
// Constants
// =============================================================================

const QR_DISPLAY_SIZE = 200;
const QR_PRINT_SIZE = 1024;

// =============================================================================
// Helpers
// =============================================================================

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// =============================================================================
// Sub-components
// =============================================================================

interface StatCardProps {
  readonly label: string;
  readonly value: string;
  readonly icon: React.ComponentType<{ className?: string }>;
  readonly iconBg: string;
  readonly iconColor: string;
}

const StatCard = memo(function StatCard({
  label,
  value,
  icon: Icon,
  iconBg,
  iconColor,
}: StatCardProps) {
  return (
    <ContentSurfaceCard className='p-4'>
      <div className='flex items-center gap-2'>
        <div
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${iconBg}`}
          aria-hidden='true'
        >
          <Icon className={`h-3.5 w-3.5 ${iconColor}`} />
        </div>
        <dt className='text-[13px] font-[510] text-secondary-token'>{label}</dt>
      </div>
      <dd className='mt-2 text-2xl font-[590] tabular-nums leading-none tracking-[-0.011em] text-primary-token'>
        {value}
      </dd>
    </ContentSurfaceCard>
  );
});

// -----------------------------------------------------------------------------

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
        className='flex items-center justify-center rounded-xl bg-white'
        style={{ width: QR_DISPLAY_SIZE, height: QR_DISPLAY_SIZE }}
        aria-hidden='true'
      >
        <div className='h-16 w-16 rounded-lg bg-gray-200 animate-pulse motion-reduce:animate-none' />
      </div>
    );
  }

  return (
    <Image
      src={dataUrl}
      alt='QR code for tip page'
      width={QR_DISPLAY_SIZE}
      height={QR_DISPLAY_SIZE}
      className='rounded-xl'
      unoptimized
    />
  );
});

// =============================================================================
// Main Component
// =============================================================================

export function EarningsTab() {
  const { selectedProfile } = useDashboardData();
  const notifications = useNotifications();
  const { data: earnings, isLoading: isEarningsLoading } = useEarningsQuery(
    Boolean(selectedProfile)
  );

  const handle =
    selectedProfile?.usernameNormalized ?? selectedProfile?.username ?? '';

  const tipUrl = useMemo(() => {
    if (!handle) return '';
    return `${BASE_URL}/${handle}/tip`;
  }, [handle]);

  // ── QR generation state ──────────────────────────
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

  // ── Download handlers ────────────────────────────
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

  // ── Copy link ────────────────────────────────────
  const { copy, isSuccess: isCopySuccess } = useClipboard({
    onSuccess: () =>
      notifications.success('Tip link copied', { duration: 2000 }),
    onError: () => notifications.error('Failed to copy link'),
  });

  const handleCopyLink = useCallback(() => {
    if (!tipUrl) return;
    copy(tipUrl);
  }, [tipUrl, copy]);

  // ── Empty state ──────────────────────────────────
  if (!handle) {
    return (
      <ContentSurfaceCard className='flex flex-col items-center justify-center gap-3 px-6 py-16 text-center'>
        <div
          className='flex h-12 w-12 items-center justify-center rounded-2xl border border-(--linear-border-subtle) bg-(--linear-bg-surface-0)'
          aria-hidden='true'
        >
          <QrCode className='h-6 w-6 text-tertiary-token' />
        </div>
        <h2 className='text-base font-[590] text-primary-token'>
          No handle set
        </h2>
        <p className='max-w-sm text-[13px] text-secondary-token'>
          Set up your artist handle in profile settings to generate a QR code
          for your tip page.
        </p>
      </ContentSurfaceCard>
    );
  }

  const stats = earnings?.stats;
  const tippers = earnings?.tippers ?? [];

  return (
    <div className='flex flex-col gap-6'>
      {/* ── Earnings Stats ─────────────────────────── */}
      <p className='text-[11px] font-[510] uppercase tracking-[0.08em] text-tertiary-token'>
        Revenue
      </p>

      {isEarningsLoading ? (
        <div className='grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4'>
          {[1, 2, 3].map(i => (
            <ContentSurfaceCard key={i} className='space-y-2 p-4'>
              <div className='flex items-center gap-2'>
                <div className='h-7 w-7 rounded-lg skeleton' />
                <div className='h-3 w-16 rounded-sm skeleton' />
              </div>
              <div className='h-7 w-20 rounded-md skeleton' />
            </ContentSurfaceCard>
          ))}
        </div>
      ) : (
        <dl className='grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4'>
          <StatCard
            label='Total revenue'
            value={formatCents(stats?.totalRevenueCents ?? 0)}
            icon={DollarSign}
            iconBg='bg-success-subtle'
            iconColor='text-success'
          />
          <StatCard
            label='Tips received'
            value={String(stats?.totalTips ?? 0)}
            icon={Hash}
            iconBg='bg-info-subtle'
            iconColor='text-info'
          />
          <StatCard
            label='Average tip'
            value={formatCents(stats?.averageTipCents ?? 0)}
            icon={TrendingUp}
            iconBg='bg-accent-subtle'
            iconColor='text-accent-token'
          />
        </dl>
      )}

      {/* ── Tippers Table ──────────────────────────── */}
      <p className='text-[11px] font-[510] uppercase tracking-[0.08em] text-tertiary-token'>
        Recent tippers
      </p>

      <ContentSurfaceCard className='overflow-hidden'>
        {isEarningsLoading && (
          <div className='space-y-3 p-4'>
            {[1, 2, 3].map(i => (
              <div key={i} className='flex items-center gap-3'>
                <div className='h-8 w-8 rounded-full skeleton' />
                <div className='flex-1 space-y-1.5'>
                  <div className='h-3 w-24 rounded-sm skeleton' />
                  <div className='h-3 w-36 rounded-sm skeleton' />
                </div>
                <div className='h-4 w-12 rounded-sm skeleton' />
              </div>
            ))}
          </div>
        )}
        {!isEarningsLoading && tippers.length === 0 && (
          <div className='flex flex-col items-center gap-3 px-6 py-12 text-center'>
            <div
              className='flex h-10 w-10 items-center justify-center rounded-xl border border-(--linear-border-subtle) bg-(--linear-bg-surface-0)'
              aria-hidden='true'
            >
              <Users className='h-5 w-5 text-tertiary-token' />
            </div>
            <p className='text-[13px] text-secondary-token'>
              No tips yet. Share your tip link to get started.
            </p>
          </div>
        )}
        {!isEarningsLoading && tippers.length > 0 && (
          <div className='overflow-x-auto'>
            <table className='w-full text-left text-[13px]'>
              <thead>
                <tr className='border-b border-(--linear-border-subtle)'>
                  <th className='px-4 py-3 text-[13px] font-[510] text-tertiary-token'>
                    Name
                  </th>
                  <th className='px-4 py-3 text-[13px] font-[510] text-tertiary-token'>
                    Email
                  </th>
                  <th className='px-4 py-3 text-right text-[13px] font-[510] text-tertiary-token'>
                    Amount
                  </th>
                  <th className='px-4 py-3 text-right text-[13px] font-[510] text-tertiary-token'>
                    Date
                  </th>
                </tr>
              </thead>
              <tbody>
                {tippers.map(tipper => (
                  <tr
                    key={tipper.id}
                    className='border-b border-(--linear-border-subtle) last:border-b-0 transition-colors hover:bg-(--linear-bg-surface-0)'
                  >
                    <td className='px-4 py-3 text-primary-token'>
                      {tipper.tipperName ?? 'Anonymous'}
                    </td>
                    <td className='px-4 py-3 text-secondary-token'>
                      {tipper.contactEmail ?? '--'}
                    </td>
                    <td className='px-4 py-3 text-right font-[510] tabular-nums text-primary-token'>
                      {formatCents(tipper.amountCents)}
                    </td>
                    <td className='px-4 py-3 text-right text-secondary-token'>
                      {formatDate(tipper.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ContentSurfaceCard>

      {/* ── QR Code Card ───────────────────────────── */}
      <p className='text-[11px] font-[510] uppercase tracking-[0.08em] text-tertiary-token'>
        QR Code
      </p>

      <ContentSurfaceCard className='p-5 sm:p-6'>
        <div className='flex items-center gap-2 mb-5'>
          <div
            className='flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-subtle'
            aria-hidden='true'
          >
            <QrCode className='h-3.5 w-3.5 text-accent-token' />
          </div>
          <h2 className='text-[13px] font-[510] text-primary-token'>
            Tip QR Code
          </h2>
        </div>

        <div className='flex flex-col items-center gap-5 sm:flex-row sm:items-start sm:gap-8'>
          {/* Preview */}
          <div className='shrink-0 rounded-[14px] border border-(--linear-border-subtle) bg-white p-3 shadow-[0_1px_0_rgba(0,0,0,0.04)]'>
            <QrPreview dataUrl={displayDataUrl} isLoading={isGenerating} />
          </div>

          {/* Actions */}
          <div className='flex flex-1 flex-col gap-4'>
            <div>
              <p className='text-[13px] font-[510] text-primary-token'>
                Share your tip page
              </p>
              <p className='mt-1 text-[13px] leading-5 text-secondary-token'>
                Download this QR code to print on merch, flyers, or display at
                shows. The high-res version is 1024px for crisp output.
              </p>
            </div>

            {/* Tip URL display */}
            <div className='flex items-center gap-2 rounded-[10px] border border-(--linear-border-subtle) bg-(--linear-bg-surface-0) px-3 py-2.5'>
              <Link2 className='h-3.5 w-3.5 shrink-0 text-tertiary-token' />
              <span className='min-w-0 flex-1 truncate text-[13px] text-secondary-token'>
                {tipUrl}
              </span>
            </div>

            {/* Action buttons */}
            <div className='flex flex-wrap gap-2'>
              <Button
                variant='secondary'
                size='sm'
                className='gap-2'
                onClick={handleDownloadPng}
                disabled={isDownloadingPng}
              >
                <FileImage className='h-3.5 w-3.5' />
                {isDownloadingPng ? 'Generating...' : 'Download PNG'}
              </Button>

              <Button
                variant='secondary'
                size='sm'
                className='gap-2'
                onClick={handleDownloadSvg}
                disabled={isDownloadingSvg}
              >
                <FileCode2 className='h-3.5 w-3.5' />
                {isDownloadingSvg ? 'Generating...' : 'Download SVG'}
              </Button>

              <Button
                variant='ghost'
                size='sm'
                className='gap-2'
                onClick={handleCopyLink}
              >
                {isCopySuccess ? (
                  <Check className='h-3.5 w-3.5 text-success' />
                ) : (
                  <Copy className='h-3.5 w-3.5' />
                )}
                {isCopySuccess ? 'Copied' : 'Copy tip link'}
              </Button>
            </div>
          </div>
        </div>
      </ContentSurfaceCard>
    </div>
  );
}

export default EarningsTab;
