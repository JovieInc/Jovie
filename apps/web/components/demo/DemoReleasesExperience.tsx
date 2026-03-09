'use client';

import { DemoAnalyticsPanel } from './DemoAnalyticsPanel';
import { DemoEmptyState } from './DemoEmptyState';
import { DemoRealAudiencePanel } from './DemoRealAudiencePanel';
import { DemoRealReleasesPanel } from './DemoRealReleasesPanel';
import { DemoSettingsPanel } from './DemoSettingsPanel';
import { DemoShell } from './DemoShell';
import type { DemoTab } from './demo-types';
import { useDemoState } from './use-demo-state';

/** Tabs that have a dedicated panel component */
const FUNCTIONAL_TABS = new Set<DemoTab>([
  'releases',
  'audience',
  'analytics',
  'settings',
]);

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
      {!FUNCTIONAL_TABS.has(activeTab) && <DemoEmptyState tab={activeTab} />}
    </DemoShell>
  );
}
