'use client';

import { Button } from '@jovie/ui';
import { Check, Copy, FileCode2, FileImage, Link2, QrCode } from 'lucide-react';
import Image from 'next/image';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { BASE_URL } from '@/constants/domains';
import { useClipboard } from '@/hooks/useClipboard';
import { useNotifications } from '@/lib/hooks/useNotifications';
import { downloadBlob, downloadString } from '@/lib/utils/download';
import { generateQrCodeDataUrl, generateQrCodeSvg } from '@/lib/utils/qr-code';

// =============================================================================
// Constants
// =============================================================================

const QR_DISPLAY_SIZE = 200;
const QR_PRINT_SIZE = 1024;

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
      // Convert data URL to blob for download
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
      <div className='flex flex-col items-center justify-center gap-3 rounded-xl border border-subtle bg-surface-1 px-6 py-16 text-center'>
        <div
          className='flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-2'
          aria-hidden='true'
        >
          <QrCode className='h-6 w-6 text-tertiary-token' />
        </div>
        <h2 className='text-base font-semibold text-primary-token'>
          No handle set
        </h2>
        <p className='max-w-sm text-sm text-secondary-token'>
          Set up your artist handle in profile settings to generate a QR code
          for your tip page.
        </p>
      </div>
    );
  }

  return (
    <div className='flex flex-col gap-6'>
      {/* ── QR Code Card ───────────────────────────── */}
      <div className='rounded-xl border border-subtle bg-surface-1 p-5 sm:p-6'>
        <div className='flex items-center gap-2 mb-5'>
          <div
            className='flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-subtle'
            aria-hidden='true'
          >
            <QrCode className='h-3.5 w-3.5 text-accent-token' />
          </div>
          <h2 className='text-sm font-medium text-primary-token'>
            Tip QR Code
          </h2>
        </div>

        <div className='flex flex-col items-center gap-5 sm:flex-row sm:items-start sm:gap-8'>
          {/* Preview */}
          <div className='shrink-0 rounded-xl bg-white p-3 shadow-sm'>
            <QrPreview dataUrl={displayDataUrl} isLoading={isGenerating} />
          </div>

          {/* Actions */}
          <div className='flex flex-1 flex-col gap-4'>
            <div>
              <p className='text-sm font-medium text-primary-token'>
                Share your tip page
              </p>
              <p className='mt-1 text-xs leading-5 text-secondary-token'>
                Download this QR code to print on merch, flyers, or display at
                shows. The high-res version is 1024px for crisp output.
              </p>
            </div>

            {/* Tip URL display */}
            <div className='flex items-center gap-2 rounded-lg border border-subtle bg-surface-0 px-3 py-2.5'>
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
      </div>
    </div>
  );
}

export default EarningsTab;
