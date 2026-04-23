'use client';

/**
 * AudienceMemberReferrers Component
 *
 * Renders source history from structured actions, UTM, and referrers.
 */

import {
  Copy,
  Download,
  ExternalLink,
  Link2,
  QrCode,
  Search,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import { DrawerEmptyState } from '@/components/molecules/drawer';
import { BASE_URL } from '@/constants/domains';
import { copyToClipboard } from '@/hooks/useClipboard';
import { formatTimeAgo } from '@/lib/utils/audience';
import { downloadBlob } from '@/lib/utils/download';
import {
  generateQrCodeDataUrl,
  qrCodeDataUrlToBlob,
} from '@/lib/utils/qr-code';
import type { AudienceMember } from '@/types';

const QR_DOWNLOAD_SIZE = 1024;

function getSourceCode(action: AudienceMember['latestActions'][number]) {
  if (typeof action.sourceLinkCode === 'string' && action.sourceLinkCode) {
    return action.sourceLinkCode;
  }

  return typeof action.properties?.code === 'string'
    ? action.properties.code
    : null;
}

function buildSourceUrl(code: string): string {
  return new URL(`/s/${code}`, BASE_URL).toString();
}

function sanitizeFilename(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, '-')
      .replaceAll(/^-|-$/g, '') || 'audience-source'
  );
}

async function downloadSourceQrCode(url: string, label: string) {
  const dataUrl = await generateQrCodeDataUrl(url, QR_DOWNLOAD_SIZE);
  const blob = qrCodeDataUrlToBlob(dataUrl);
  downloadBlob(blob, `${sanitizeFilename(label)}-qr.png`);
}

interface AudienceMemberReferrersProps
  extends Readonly<{
    readonly member: AudienceMember;
  }> {}

export function AudienceMemberReferrers({
  member,
}: AudienceMemberReferrersProps) {
  const actionSources = member.latestActions
    .filter(action => action.sourceLabel)
    .map((action, index) => {
      const code = getSourceCode(action);
      return {
        key: [
          'action',
          action.sourceKind ?? 'source',
          action.sourceLabel,
          action.sourceLinkId ??
            action.sourceLinkCode ??
            action.timestamp ??
            index,
        ].join('-'),
        label: action.sourceLabel as string,
        detail: action.sourceKind
          ? action.sourceKind.replaceAll('_', ' ')
          : 'Source',
        timestamp: action.timestamp,
        kind: action.sourceKind,
        sourceUrl: code ? buildSourceUrl(code) : null,
      };
    });
  const utmSource = member.utmParams.source
    ? [
        {
          key: `utm-${member.utmParams.source}-${member.utmParams.medium ?? ''}`,
          label: member.utmParams.medium
            ? `${member.utmParams.source} / ${member.utmParams.medium}`
            : member.utmParams.source,
          detail: 'UTM',
          timestamp: member.lastSeenAt ?? undefined,
          kind: 'utm',
          sourceUrl: null,
        },
      ]
    : [];
  const referrers = member.referrerHistory.slice(0, 6).map(ref => ({
    key: `referrer-${ref.url}-${ref.timestamp ?? ''}`,
    label: ref.url,
    detail: 'Referrer',
    timestamp: ref.timestamp,
    kind: 'referrer',
    sourceUrl: null,
  }));
  const sources = [...actionSources, ...utmSource, ...referrers];

  if (sources.length === 0) {
    return (
      <DrawerEmptyState
        className='min-h-[88px]'
        message='No source data yet.'
      />
    );
  }

  return (
    <ul className='space-y-1'>
      {sources.map(source => (
        <li
          key={`${member.id}-${source.key}`}
          className='rounded-md border border-transparent px-1.5 py-1.5 text-xs text-primary-token transition-colors hover:bg-surface-0'
        >
          <div className='flex items-start gap-2'>
            <SourceIcon kind={source.kind} />
            <div className='min-w-0 flex-1'>
              <div className='truncate leading-4'>{source.label}</div>
              <div className='mt-0.5 flex items-center gap-1.5 text-[10.5px] text-secondary-token'>
                <span>{source.detail}</span>
                {source.timestamp ? (
                  <span>{formatTimeAgo(source.timestamp)}</span>
                ) : null}
              </div>
            </div>
            {source.sourceUrl ? (
              <SourceActions url={source.sourceUrl} label={source.label} />
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

function SourceActions({
  url,
  label,
}: {
  readonly url: string;
  readonly label: string;
}) {
  return (
    <div className='flex shrink-0 items-center gap-0.5'>
      <SourceActionButton
        label='Copy Link'
        onClick={async () => {
          const copied = await copyToClipboard(url);
          if (copied) {
            toast.success('Source link copied');
            return;
          }
          toast.error('Unable to copy source link');
        }}
      >
        <Copy className='h-3 w-3' aria-hidden />
      </SourceActionButton>
      <SourceActionButton
        label='Open Link'
        onClick={() => {
          globalThis.open(url, '_blank', 'noopener,noreferrer');
        }}
      >
        <ExternalLink className='h-3 w-3' aria-hidden />
      </SourceActionButton>
      <SourceActionButton
        label='Download QR Code'
        onClick={async () => {
          try {
            await downloadSourceQrCode(url, label);
            toast.success('QR code downloaded');
          } catch {
            toast.error('Unable to download QR code');
          }
        }}
      >
        <Download className='h-3 w-3' aria-hidden />
      </SourceActionButton>
    </div>
  );
}

function SourceActionButton({
  label,
  onClick,
  children,
}: {
  readonly label: string;
  readonly onClick: () => void | Promise<void>;
  readonly children: ReactNode;
}) {
  return (
    <button
      type='button'
      className='inline-flex h-6 w-6 items-center justify-center rounded-md text-tertiary-token transition-colors hover:bg-surface-1 hover:text-primary-token focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
      title={label}
      aria-label={label}
      onClick={event => {
        event.stopPropagation();
        void onClick();
      }}
    >
      {children}
    </button>
  );
}

function SourceIcon({ kind }: { readonly kind: string | undefined }) {
  const className = 'mt-0.5 h-3 w-3 shrink-0 text-tertiary-token';
  if (kind === 'qr') return <QrCode className={className} aria-hidden />;
  if (kind === 'utm') return <Search className={className} aria-hidden />;
  return <Link2 className={className} aria-hidden />;
}
