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
import { useAppFlag } from '@/lib/flags/client';
import {
  getProfileMonetizationHeading,
  getProfileMonetizationPrimaryActionLabel,
  isProfileMonetizationShareable,
  type ProfileMonetizationSummaryResponse,
} from '@/lib/profile-monetization';
import { cn } from '@/lib/utils';
import { downloadBlob, downloadString } from '@/lib/utils/download';
import {
  generateQrCodeDataUrl,
  generateQrCodeSvg,
  qrCodeDataUrlToBlob,
} from '@/lib/utils/qr-code';

const QR_DISPLAY_SIZE = 224;
const QR_DOWNLOAD_SIZE = 1024;

type TipsSurfaceVariant = 'settings' | 'drawer';

export interface ProfilePaySurfaceProps {
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

function QrPreviewPanel({
  qrPreviewUrl,
  isDrawer,
}: Readonly<{ qrPreviewUrl: string | null; isDrawer: boolean }>) {
  return (
    <div
      className={cn(
        'shrink-0 rounded-[18px] border border-(--linear-app-frame-seam) bg-surface-0',
        isDrawer
          ? 'flex h-[156px] w-[156px] items-center justify-center p-3'
          : 'flex h-[148px] w-[148px] items-center justify-center p-3'
      )}
    >
      {qrPreviewUrl ? (
        <Image
          src={qrPreviewUrl}
          alt='Payment QR code'
          width={isDrawer ? 132 : 124}
          height={isDrawer ? 132 : 124}
          unoptimized
          className='h-full w-full rounded-[10px] bg-white object-contain'
        />
      ) : (
        <div className='space-y-2 text-center'>
          <div className='mx-auto flex h-10 w-10 items-center justify-center rounded-xl border border-(--linear-app-frame-seam) bg-surface-1 text-tertiary-token'>
            <Link2 className='h-4 w-4' aria-hidden='true' />
          </div>
          <p className='text-2xs leading-[14px] text-tertiary-token'>
            QR unlocks when payments are live.
          </p>
        </div>
      )}
    </div>
  );
}

function ProviderPill({
  provider,
}: Readonly<{
  provider: ProfileMonetizationSummaryResponse['provider'];
}>) {
  if (provider === 'none') return null;

  return (
    <span className='inline-flex items-center rounded-full border border-(--linear-app-frame-seam) bg-surface-0 px-2 py-0.5 text-2xs font-caption text-secondary-token'>
      {provider === 'stripe' ? 'Stripe' : 'Venmo'}
    </span>
  );
}

export function ProfilePaySurface({
  summary,
  variant = 'settings',
  onSetUsername,
  onSetUpTips,
  onManagePayments,
  onViewAnalytics,
  className,
}: Readonly<ProfilePaySurfaceProps>) {
  const isStripeConnectEnabled = useAppFlag('STRIPE_CONNECT_ENABLED');
  const isDrawer = variant === 'drawer';
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
    setStatusMessage(
      didCopy ? 'Payment link copied.' : 'Could not copy payment link.'
    );
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
      const blob = qrCodeDataUrlToBlob(dataUrl);
      const username = summary.tipUrl.split('/').at(-2) ?? 'pay-link';
      downloadBlob(blob, `jovie-pay-${username}.png`);
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
      const username = summary.tipUrl.split('/').at(-2) ?? 'pay-link';
      downloadString(svgString, {
        filename: `jovie-pay-${username}.svg`,
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
        'grid gap-4',
        isDrawer
          ? 'grid-cols-[minmax(0,1fr)_156px] items-start px-3 pb-1 pt-1'
          : 'px-4 py-4 sm:px-5 lg:grid-cols-[minmax(0,1fr)_148px] lg:items-start',
        className
      )}
      data-testid={`profile-tips-surface-${variant}`}
    >
      <div className={cn('min-w-0', isDrawer ? 'space-y-4' : 'space-y-3')}>
        <div className='flex flex-wrap items-center gap-2'>
          <span className='inline-flex items-center gap-1.5 rounded-full border border-(--linear-app-frame-seam) bg-surface-0 px-2 py-0.5 text-2xs font-caption text-secondary-token'>
            <StatusIcon paymentState={summary.paymentState} />
            {getProfileMonetizationHeading(summary.paymentState)}
          </span>
          <ProviderPill provider={summary.provider} />
        </div>

        <p
          className={cn(
            'text-app leading-[19px] text-secondary-token',
            isDrawer ? 'max-w-[30ch]' : 'max-w-[48ch]'
          )}
        >
          {summary.narrative}
        </p>

        <div className={cn('space-y-2.5', isDrawer ? 'max-w-[13rem]' : null)}>
          <div
            className={cn(
              'flex gap-2',
              isDrawer ? 'flex-col items-start' : 'flex-wrap items-center'
            )}
          >
            <Button
              type='button'
              size='sm'
              variant='primary'
              onClick={() => {
                handlePrimaryAction();
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
                      handleDownloadPng();
                    }}
                    disabled={isDownloadingPng}
                  >
                    Download PNG
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      handleDownloadSvg();
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
              className='inline-flex w-fit items-start gap-1.5 text-left text-xs font-caption text-secondary-token transition-colors hover:text-primary-token'
            >
              <span>View payment traffic in Analytics</span>
              <ArrowUpRight
                className='mt-0.5 h-3.5 w-3.5 shrink-0'
                aria-hidden='true'
              />
            </button>
          ) : null}

          <p
            className={cn(
              'text-xs text-tertiary-token',
              !statusMessage && 'sr-only'
            )}
            aria-live='polite'
          >
            {statusMessage}
          </p>
        </div>
      </div>

      <div
        className={cn(
          'flex',
          isDrawer ? 'justify-end pt-0.5' : 'lg:justify-end'
        )}
      >
        <QrPreviewPanel qrPreviewUrl={qrPreviewUrl} isDrawer={isDrawer} />
      </div>
    </div>
  );
}
