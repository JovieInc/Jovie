'use client';

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
  const profile = INTERNAL_DJ_DEMO_PERSONA.profile;
  const profileUrl = `https://jov.ie/${profile.handle}`;

  return (
    <DemoAuthShell>
      <AudiencePanelProvider initialMode='analytics'>
        <DashboardAudienceWorkspace
          mode='members'
          view='all'
          rows={DEMO_AUDIENCE_ROWS}
          total={DEMO_AUDIENCE_ROWS.length}
          sort='lastSeen'
          direction='desc'
          onSortChange={() => {}}
          onViewChange={() => {}}
          onFiltersChange={() => {}}
          profileUrl={profileUrl}
          profileId='demo-profile'
          subscriberCount={
            DEMO_AUDIENCE_ROWS.filter(member => member.email).length
          }
          totalAudienceCount={DEMO_AUDIENCE_ROWS.length}
          filters={DEFAULT_AUDIENCE_FILTERS}
          actionAdapter={DEMO_AUDIENCE_ACTION_ADAPTER}
          analyticsMode='static'
          analyticsData={DEMO_STATIC_AUDIENCE_ANALYTICS}
          analyticsSidebarTestId='demo-analytics-sidebar'
          analyticsTabbedCardTestId='demo-analytics-tabbed-card'
          testId='demo-audience-shell'
        />
      </AudiencePanelProvider>
    </DemoAuthShell>
  );
}
