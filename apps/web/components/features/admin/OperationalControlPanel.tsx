'use client';

import { Terminal } from 'lucide-react';
import { useEffect, useState } from 'react';
import { CampaignSettingsPanel } from '@/components/features/admin/campaigns/CampaignSettingsPanel';
import { WaitlistSettingsPanel } from '@/components/features/admin/WaitlistSettingsPanel';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { SettingsPanel } from '@/components/molecules/settings/SettingsPanel';
import { SettingsToggleRow } from '@/components/molecules/settings/SettingsToggleRow';

const DEV_TOOLBAR_COOKIE = '__dev_toolbar';

function useDevToolbarCookie() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    setEnabled(document.cookie.includes(`${DEV_TOOLBAR_COOKIE}=1`));
  }, []);

  const toggle = (checked: boolean) => {
    if (checked) {
      document.cookie = `${DEV_TOOLBAR_COOKIE}=1; path=/; max-age=31536000; SameSite=Lax`;
    } else {
      document.cookie = `${DEV_TOOLBAR_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
    }
    setEnabled(checked);
    globalThis.location.reload();
  };

  return { enabled, toggle };
}

/**
 * Consolidated daily-use operational toggles for the admin Ops surface.
 * Replaces the former Settings > Admin section.
 */
export function OperationalControlPanel() {
  const devToolbar = useDevToolbarCookie();

  return (
    <ContentSurfaceCard
      className='overflow-hidden'
      data-testid='operational-control-panel'
    >
      <ContentSectionHeader
        title='Operational controls'
        subtitle='Environment, people intake, and growth defaults in one place.'
      />
      <div className='space-y-6 p-4 sm:p-5'>
        <SettingsPanel
          title='Platform & Environment'
          description='Local environment helpers for operator sessions.'
        >
          <div className='px-4 py-4 sm:px-5'>
            <SettingsToggleRow
              icon={<Terminal className='h-4 w-4' aria-hidden />}
              title='Dev toolbar'
              description='Show the toolbar with feature-flag overrides and environment details.'
              checked={devToolbar.enabled}
              onCheckedChange={devToolbar.toggle}
              ariaLabel='Toggle dev toolbar'
            />
          </div>
        </SettingsPanel>

        <WaitlistSettingsPanel />
        <CampaignSettingsPanel />
      </div>
    </ContentSurfaceCard>
  );
}
