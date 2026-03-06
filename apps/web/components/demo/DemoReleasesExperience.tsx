'use client';

import { DemoAnalyticsPanel } from './DemoAnalyticsPanel';
import { DemoRealAudiencePanel } from './DemoRealAudiencePanel';
import { DemoRealReleasesPanel } from './DemoRealReleasesPanel';
import { DemoSettingsPanel } from './DemoSettingsPanel';
import { DemoShell } from './DemoShell';
import { useDemoState } from './use-demo-state';

export function DemoReleasesExperience({
  containerClassName,
}: {
  readonly containerClassName?: string;
} = {}) {
  const { activeTab, switchTab } = useDemoState();

  return (
    <DemoShell
      activeTab={activeTab}
      onTabChange={switchTab}
      containerClassName={containerClassName}
    >
      {activeTab === 'releases' && <DemoRealReleasesPanel />}
      {activeTab === 'audience' && <DemoRealAudiencePanel />}
      {activeTab === 'analytics' && <DemoAnalyticsPanel />}
      {activeTab === 'settings' && <DemoSettingsPanel />}
    </DemoShell>
  );
}
