'use client';

import { RightDrawer } from '@/components/organisms/RightDrawer';
import { DemoAnalyticsPanel } from './DemoAnalyticsPanel';
import { DemoAudiencePanel } from './DemoAudiencePanel';
import { DemoReleaseDetail } from './DemoReleaseDetail';
import { DemoReleasesPanel } from './DemoReleasesPanel';
import { DemoSettingsPanel } from './DemoSettingsPanel';
import { DemoShell } from './DemoShell';
import { useDemoState } from './use-demo-state';

export function DemoReleasesExperience() {
  const {
    activeTab,
    switchTab,
    selectedItemId,
    setSelectedItemId,
    selectedRelease,
    groupedReleases,
  } = useDemoState();

  const rightPanel =
    activeTab === 'releases' ? (
      <RightDrawer
        isOpen={selectedRelease != null}
        width={400}
        ariaLabel='Release details panel'
      >
        {selectedRelease && (
          <DemoReleaseDetail
            release={selectedRelease}
            onClose={() => setSelectedItemId(null)}
          />
        )}
      </RightDrawer>
    ) : undefined;

  return (
    <DemoShell
      activeTab={activeTab}
      onTabChange={switchTab}
      rightPanel={rightPanel}
    >
      {activeTab === 'releases' && (
        <DemoReleasesPanel
          groups={groupedReleases}
          selectedId={selectedItemId}
          onSelect={id => setSelectedItemId(id === selectedItemId ? null : id)}
        />
      )}
      {activeTab === 'audience' && <DemoAudiencePanel />}
      {activeTab === 'analytics' && <DemoAnalyticsPanel />}
      {activeTab === 'settings' && <DemoSettingsPanel />}
    </DemoShell>
  );
}
