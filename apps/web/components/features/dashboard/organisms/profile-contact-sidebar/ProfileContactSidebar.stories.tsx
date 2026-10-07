import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { type ReactNode, useEffect } from 'react';
import { withDashboardProviders } from '@/.storybook/dashboard-fixtures';
import {
  type PreviewPanelData,
  usePreviewPanelData,
  usePreviewPanelState,
} from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { ProfileContactSidebar } from './ProfileContactSidebar';

const previewData: PreviewPanelData = {
  username: 'alex',
  displayName: 'Alex Rivera',
  avatarUrl: null,
  bio: 'Independent artist',
  genres: ['indie pop'],
  location: 'Los Angeles, CA',
  hometown: null,
  activeSinceYear: 2019,
  links: [],
  profilePath: '/alex',
  dspConnections: {
    spotify: { connected: false, artistName: null },
    appleMusic: { connected: false, artistName: null },
  },
};

/** Seeds the preview panel the way PreviewDataHydrator does on real routes,
 * then opens the rail so the sidebar renders its populated state. */
function SeedProfileRail({ children }: { readonly children: ReactNode }) {
  const { setPreviewData } = usePreviewPanelData();
  const { open } = usePreviewPanelState();
  useEffect(() => {
    setPreviewData(previewData);
    open();
  }, [setPreviewData, open]);
  return <>{children}</>;
}

const meta = {
  title: 'Features/Dashboard/ProfileContactSidebar',
  component: ProfileContactSidebar,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    withDashboardProviders,
    Story => (
      <SeedProfileRail>
        <Story />
      </SeedProfileRail>
    ),
  ],
} satisfies Meta<typeof ProfileContactSidebar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {};
