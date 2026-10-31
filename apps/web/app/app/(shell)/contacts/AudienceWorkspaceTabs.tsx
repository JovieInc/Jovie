import { RouteSegmentControl } from '@/components/molecules/RouteSegmentControl';
import { PageToolbar } from '@/components/organisms/table/molecules/PageToolbar';
import {
  type AudienceWorkspaceDestination,
  getAudienceWorkspaceNavigation,
} from '@/lib/audience/workspace-navigation';

/**
 * The Audience root's sub-navigation (Contacts, Audience, Insights). Every
 * destination renders it so the user keeps their place inside Audience.
 */
export function AudienceWorkspaceTabs({
  activeTab,
  audienceHref,
}: Readonly<{
  activeTab: AudienceWorkspaceDestination;
  audienceHref?: string;
}>) {
  return (
    <PageToolbar
      className='border-b border-subtle'
      start={
        <RouteSegmentControl
          value={activeTab}
          aria-label='Audience Workspace'
          surface='ghost'
          // Tabs hug their labels, like every other toolbar tab row.
          layout='hug'
          options={getAudienceWorkspaceNavigation(audienceHref)}
        />
      }
    />
  );
}
