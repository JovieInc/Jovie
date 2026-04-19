'use client';

import { useSearchParams } from 'next/navigation';
import { useMemo } from 'react';
import { toast } from 'sonner';
import { AudiencePanelProvider } from '@/features/dashboard/organisms/AudiencePanelContext';
import { DashboardAudienceWorkspace } from '@/features/dashboard/organisms/DashboardAudienceWorkspace';
import {
  type AudienceActionAdapter,
  DEFAULT_AUDIENCE_FILTERS,
} from '@/features/dashboard/organisms/dashboard-audience-table';
import { copyTextToClipboard } from '@/features/dashboard/organisms/dashboard-audience-table/utils';
import { INTERNAL_DJ_DEMO_PERSONA } from '@/lib/demo-personas';
import { downloadBlob } from '@/lib/utils/download';
import {
  generateQrCodeDataUrl,
  qrCodeDataUrlToBlob,
} from '@/lib/utils/qr-code';
import { DemoAuthShell } from './DemoAuthShell';
import {
  DEMO_AUDIENCE_ROWS,
  DEMO_SOURCE_LINK_URL,
  DEMO_STATIC_AUDIENCE_ANALYTICS,
} from './demo-surface-fixtures';

type AudienceCaptureMode =
  | 'default'
  | 'quality'
  | 'crm'
  | 'geo'
  | 'retargeting';

function isAudienceCaptureMode(
  value: string | null
): value is AudienceCaptureMode {
  return (
    value === null ||
    value === 'quality' ||
    value === 'crm' ||
    value === 'geo' ||
    value === 'retargeting'
  );
}

function getAudienceCaptureRows(mode: AudienceCaptureMode) {
  switch (mode) {
    case 'quality':
      return [...DEMO_AUDIENCE_ROWS].sort((left, right) => {
        if (left.intentLevel !== right.intentLevel) {
          const order = { high: 0, medium: 1, low: 2 };
          return order[left.intentLevel] - order[right.intentLevel];
        }

        return (
          (right.tipAmountTotalCents ?? 0) - (left.tipAmountTotalCents ?? 0)
        );
      });
    case 'crm':
      return [...DEMO_AUDIENCE_ROWS].sort((left, right) => {
        const leftScore =
          (left.email ? 3 : 0) +
          (left.phone ? 2 : 0) +
          (left.spotifyConnected ? 1 : 0);
        const rightScore =
          (right.email ? 3 : 0) +
          (right.phone ? 2 : 0) +
          (right.spotifyConnected ? 1 : 0);

        return rightScore - leftScore;
      });
    case 'retargeting':
      return [...DEMO_AUDIENCE_ROWS].sort((left, right) => {
        if (left.visits !== right.visits) {
          return right.visits - left.visits;
        }

        return (right.tipCount ?? 0) - (left.tipCount ?? 0);
      });
    case 'geo':
    case 'default':
    default:
      return DEMO_AUDIENCE_ROWS;
  }
}

const DEMO_AUDIENCE_ACTION_ADAPTER: AudienceActionAdapter = {
  onBlockMember(member) {
    toast.info(
      `Blocking ${member.displayName ?? 'this visitor'} is disabled in demo mode`
    );
  },
  onSendNotification(member) {
    toast.info(
      `Notifications for ${member.displayName ?? 'this visitor'} are disabled in demo mode`
    );
  },
  async onSourceLinkAction(action) {
    if (action === 'copy') {
      const copied = await copyTextToClipboard(DEMO_SOURCE_LINK_URL);
      if (copied) {
        toast.success('Source link copied');
        return;
      }

      toast.error('Unable to copy source link');
      return;
    }

    if (action === 'open') {
      globalThis.open(DEMO_SOURCE_LINK_URL, '_blank', 'noopener,noreferrer');
      return;
    }

    try {
      const dataUrl = await generateQrCodeDataUrl(DEMO_SOURCE_LINK_URL, 1024);
      downloadBlob(qrCodeDataUrlToBlob(dataUrl), 'demo-source-link-qr.png');
      toast.success('QR code downloaded');
    } catch {
      toast.error('Unable to download QR code');
    }
  },
};

export function DemoAudienceWorkspace() {
  const searchParams = useSearchParams();
  const profile = INTERNAL_DJ_DEMO_PERSONA.profile;
  const profileUrl = `https://jov.ie/${profile.handle}`;
  const requestedCapture = searchParams.get('capture');
  const captureMode: AudienceCaptureMode = isAudienceCaptureMode(
    requestedCapture
  )
    ? (requestedCapture ?? 'default')
    : 'default';
  const rows = useMemo(
    () => getAudienceCaptureRows(captureMode),
    [captureMode]
  );
  const initialPanelMode =
    captureMode === 'quality' ||
    captureMode === 'crm' ||
    captureMode === 'retargeting'
      ? null
      : 'analytics';
  const captureTestIds: Record<string, string> = {
    quality: 'demo-audience-capture-quality',
    crm: 'demo-audience-capture-crm',
    retargeting: 'demo-audience-capture-retargeting',
  };
  const tableTestId = captureTestIds[captureMode] ?? 'demo-audience-shell';
  const analyticsSidebarTestId =
    captureMode === 'geo'
      ? 'demo-audience-capture-geo'
      : 'demo-analytics-sidebar';

  return (
    <DemoAuthShell>
      <AudiencePanelProvider initialMode={initialPanelMode}>
        <DashboardAudienceWorkspace
          mode='members'
          view='all'
          rows={rows}
          total={rows.length}
          sort='lastSeen'
          direction='desc'
          onSortChange={() => {}}
          onViewChange={() => {}}
          onFiltersChange={() => {}}
          profileUrl={profileUrl}
          profileId='demo-profile'
          subscriberCount={rows.filter(member => member.email).length}
          totalAudienceCount={rows.length}
          filters={DEFAULT_AUDIENCE_FILTERS}
          actionAdapter={DEMO_AUDIENCE_ACTION_ADAPTER}
          analyticsMode='static'
          analyticsData={DEMO_STATIC_AUDIENCE_ANALYTICS}
          analyticsSidebarTestId={analyticsSidebarTestId}
          analyticsTabbedCardTestId='demo-analytics-tabbed-card'
          testId={tableTestId}
        />
      </AudiencePanelProvider>
    </DemoAuthShell>
  );
}
