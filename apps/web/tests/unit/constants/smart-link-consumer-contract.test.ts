import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB_ROOT = resolve(__dirname, '../../..');
const RELEASE_SIDEBAR_SOURCE =
  'components/organisms/release-sidebar/ReleaseSidebar.tsx';
const RELEASE_SMART_LINK_ANALYTICS_SOURCE =
  'components/organisms/release-sidebar/ReleaseSmartLinkAnalytics.tsx';
const RELEASE_SMART_LINK_SECTION_SOURCE =
  'components/organisms/release-sidebar/ReleaseSmartLinkSection.tsx';
const SMART_LINK_CONSUMERS = [
  'components/features/dashboard/organisms/release-provider-matrix/useReleaseProviderMatrix.ts',
  'components/features/dashboard/organisms/release-provider-matrix/utils/exportReleases.ts',
  'components/features/dashboard/organisms/releases/cells/ProviderCell.tsx',
  'components/features/dashboard/organisms/releases/cells/SmartLinkCell.tsx',
  'components/features/dashboard/organisms/releases/components/ProviderCopyButton.tsx',
  'components/features/dashboard/organisms/releases/release-actions.tsx',
  'components/features/demo/demo-release-experience-adapter.ts',
  'components/features/home/demo/DashboardReleasesDemo.tsx',
  'components/organisms/release-sidebar/ReleaseSidebar.tsx',
  'components/organisms/release-sidebar/ReleaseSmartLinkAnalytics.tsx',
  'components/organisms/release-sidebar/ReleaseSmartLinkSection.tsx',
  'components/organisms/release-sidebar/TrackDetailPanel.tsx',
  'components/organisms/release-sidebar/TrackSidebar.tsx',
] as const;

describe('smart-link consumer contract', () => {
  it.each(
    SMART_LINK_CONSUMERS
  )('%s uses the canonical public URL builder', sourcePath => {
    const source = readFileSync(resolve(WEB_ROOT, sourcePath), 'utf8');

    expect(source).toContain('getSmartLinkUrl');
    expect(source).not.toContain('getBaseUrl');
  });

  it('keeps the release sidebar family on the canonical builder', () => {
    const releaseSidebarSource = readFileSync(
      resolve(WEB_ROOT, RELEASE_SIDEBAR_SOURCE),
      'utf8'
    );
    const analyticsSource = readFileSync(
      resolve(WEB_ROOT, RELEASE_SMART_LINK_ANALYTICS_SOURCE),
      'utf8'
    );
    const sectionSource = readFileSync(
      resolve(WEB_ROOT, RELEASE_SMART_LINK_SECTION_SOURCE),
      'utf8'
    );

    expect(releaseSidebarSource).toContain('getSmartLinkUrl');
    expect(analyticsSource).toContain('getSmartLinkUrl');
    expect(sectionSource).toContain('getSmartLinkUrl');
  });
});
