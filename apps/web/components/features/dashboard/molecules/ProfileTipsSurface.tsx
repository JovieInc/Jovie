'use client';

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@jovie/ui';
import {
  ArrowUpRight,
  CheckCircle2,
  CreditCard,
  Link2,
  QrCode,
} from 'lucide-react';
import Image from 'next/image';
import { useCallback, useEffect, useState } from 'react';
import { copyToClipboard } from '@/hooks/useClipboard';
import { useCodeFlag } from '@/lib/feature-flags/client';
import {
  getProfileMonetizationHeading,
  getProfileMonetizationPrimaryActionLabel,
  isProfileMonetizationShareable,
  type ProfileMonetizationSummaryResponse,
} from '@/lib/profile-monetization';
import { cn } from '@/lib/utils';
import { downloadBlob, downloadString } from '@/lib/utils/download';
import { generateQrCodeDataUrl, generateQrCodeSvg } from '@/lib/utils/qr-code';

const QR_DISPLAY_SIZE = 224;
const QR_DOWNLOAD_SIZE = 1024;

type TipsSurfaceVariant = 'settings' | 'drawer';

export interface ProfileTipsSurfaceProps {
  readonly summary: ProfileMonetizationSummaryResponse;
  readonly variant?: TipsSurfaceVariant;
  readonly onSetUsername: () => void;
  readonly onSetUpTips: () => void;
  readonly onManagePayments: () => void;
  readonly onViewAnalytics?: () => void;
  readonly className?: string;
}

function StatusIcon({
  paymentState,
}: Readonly<{
  paymentState: ProfileMonetizationSummaryResponse['paymentState'];
}>) {
  if (paymentState === 'not_setup' || paymentState === 'setup_incomplete') {
    return <CreditCard className='h-3.5 w-3.5' aria-hidden='true' />;
  }

  return <CheckCircle2 className='h-3.5 w-3.5' aria-hidden='true' />;
}

function ProviderPill({
  provider,
}: Readonly<{
  provider: ProfileMonetizationSummaryResponse['provider'];
}>) {
  if (provider === 'none') return null;

  return (
    <span className='inline-flex items-center rounded-full border border-(--linear-app-frame-seam) bg-surface-0 px-2 py-0.5 text-[11px] font-[510] text-secondary-token'>
      {provider === 'stripe' ? 'Stripe' : 'Venmo'}
    </span>
  );
}

export function ProfileTipsSurface({
  summary,
  variant = 'settings',
  onSetUsername,
  onSetUpTips,
  onManagePayments,
  onViewAnalytics,
  className,
}: Readonly<ProfileTipsSurfaceProps>) {
  const isStripeConnectEnabled = useCodeFlag('STRIPE_CONNECT_ENABLED');
  const isShareable =
    summary.tipUrl !== null &&
    isProfileMonetizationShareable(summary.paymentState);
  const [qrPreviewUrl, setQrPreviewUrl] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [isDownloadingPng, setIsDownloadingPng] = useState(false);
  const [isDownloadingSvg, setIsDownloadingSvg] = useState(false);

  useEffect(() => {
    if (!isShareable || summary.tipUrl === null) {
      setQrPreviewUrl(null);
      return;
    }

    let cancelled = false;

    generateQrCodeDataUrl(summary.tipUrl, QR_DISPLAY_SIZE).then(
      dataUrl => {
        if (!cancelled) {
          setQrPreviewUrl(dataUrl);
        }
      },
      () => {
        if (!cancelled) {
          setQrPreviewUrl(null);
        }
      }
    );

    return () => {
      cancelled = true;
    };
  }, [isShareable, summary.tipUrl]);

  const handleCopyTipLink = useCallback(async () => {
    if (summary.tipUrl === null) return;
    const didCopy = await copyToClipboard(summary.tipUrl);
    setStatusMessage(didCopy ? 'Tip link copied.' : 'Could not copy tip link.');
  }, [summary.tipUrl]);

  const handlePrimaryAction = useCallback(async () => {
    switch (summary.paymentState) {
      case 'needs_profile_url':
        onSetUsername();
        break;
      case 'not_setup':
        onSetUpTips();
        break;
      case 'setup_incomplete':
        onManagePayments();
        break;
      case 'ready_no_activity':
      case 'traffic_no_tips':
      case 'active':
        await handleCopyTipLink();
        break;
    }
  }, [
    handleCopyTipLink,
    onManagePayments,
    onSetUpTips,
    onSetUsername,
    summary.paymentState,
  ]);

  const handleDownloadPng = useCallback(async () => {
    if (summary.tipUrl === null) return;

    setIsDownloadingPng(true);
    try {
      const dataUrl = await generateQrCodeDataUrl(
        summary.tipUrl,
        QR_DOWNLOAD_SIZE
      );
      const response = await fetch(dataUrl);
      const blob = await response.blob();
      const username = summary.tipUrl.split('/').at(-2) ?? 'tip-link';
      downloadBlob(blob, `jovie-tip-${username}.png`);
      setStatusMessage('QR code downloaded as PNG.');
    } catch {
      setStatusMessage('Could not download PNG QR code.');
    } finally {
      setIsDownloadingPng(false);
    }
  }, [summary.tipUrl]);

  const handleDownloadSvg = useCallback(async () => {
    if (summary.tipUrl === null) return;

    setIsDownloadingSvg(true);
    try {
      const svgString = await generateQrCodeSvg(
        summary.tipUrl,
        QR_DOWNLOAD_SIZE
      );
      const username = summary.tipUrl.split('/').at(-2) ?? 'tip-link';
      downloadString(svgString, {
        filename: `jovie-tip-${username}.svg`,
        mimeType: 'image/svg+xml',
      });
      setStatusMessage('QR code downloaded as SVG.');
    } catch {
      setStatusMessage('Could not download SVG QR code.');
    } finally {
      setIsDownloadingSvg(false);
    }
  }, [summary.tipUrl]);

  return (
    <div
      className={cn(
        'grid gap-4 lg:grid-cols-[minmax(0,1fr)_132px] lg:items-start',
        variant === 'drawer' ? 'px-3 pb-1 pt-1' : 'px-4 py-4 sm:px-5',
        className
      )}
      data-testid={`profile-tips-surface-${variant}`}
    >
      <div className='min-w-0 space-y-3'>
        <div className='flex flex-wrap items-center gap-2'>
          <span className='inline-flex items-center gap-1.5 rounded-full border border-(--linear-app-frame-seam) bg-surface-0 px-2 py-0.5 text-[11px] font-[510] text-secondary-token'>
            <StatusIcon paymentState={summary.paymentState} />
            {getProfileMonetizationHeading(summary.paymentState)}
          </span>
          <ProviderPill provider={summary.provider} />
        </div>

        <p className='max-w-[48ch] text-[13px] leading-[19px] text-secondary-token'>
          {summary.narrative}
        </p>

        <div className='flex flex-wrap items-center gap-2'>
          <Button
            type='button'
            size='sm'
            variant='primary'
            onClick={() => {
              void handlePrimaryAction();
            }}
          >
            {getProfileMonetizationPrimaryActionLabel(
              summary.paymentState,
              isStripeConnectEnabled
            )}
          </Button>

          {isShareable ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type='button'
                  size='sm'
                  variant='secondary'
                  disabled={isDownloadingPng || isDownloadingSvg}
                >
                  <QrCode className='mr-1.5 h-3.5 w-3.5' aria-hidden='true' />
                  Download QR
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='start' sideOffset={6}>
                <DropdownMenuItem
                  onClick={() => {
                    void handleDownloadPng();
                  }}
                  disabled={isDownloadingPng}
                >
                  Download PNG
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    void handleDownloadSvg();
                  }}
                  disabled={isDownloadingSvg}
                >
                  Download SVG
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>

        {summary.tipVisits > 0 && onViewAnalytics ? (
          <button
            type='button'
            onClick={onViewAnalytics}
            className='inline-flex items-center gap-1 text-[12px] font-[510] text-secondary-token transition-colors hover:text-primary-token'
          >
            View Tip Traffic In Analytics
            <ArrowUpRight className='h-3.5 w-3.5' aria-hidden='true' />
          </button>
        ) : null}

        <p
          className='min-h-[16px] text-[12px] text-tertiary-token'
          aria-live='polite'
        >
          {statusMessage}
        </p>
      </div>

      <div className='flex lg:justify-end'>
        <div className='flex h-[132px] w-[132px] shrink-0 items-center justify-center rounded-[16px] border border-(--linear-app-frame-seam) bg-surface-0 p-3'>
          {qrPreviewUrl ? (
            <Image
              src={qrPreviewUrl}
              alt='Tip QR code'
              width={132}
              height={132}
              unoptimized
              className='h-full w-full rounded-[10px] bg-white object-contain'
            />
          ) : (
            <div className='space-y-2 text-center'>
              <div className='mx-auto flex h-10 w-10 items-center justify-center rounded-[12px] border border-(--linear-app-frame-seam) bg-surface-1 text-tertiary-token'>
                <Link2 className='h-4 w-4' aria-hidden='true' />
              </div>
              <p className='text-[11px] leading-[14px] text-tertiary-token'>
                QR unlocks when tips are live.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
