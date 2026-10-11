import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { withDashboardProviders } from '@/.storybook/dashboard-fixtures';
import type { ProfileSocialLink } from '@/app/app/(shell)/dashboard/actions/social-links';
import type { AvailableDSP } from '@/lib/dsp';
import { PreviewDataHydrator } from './PreviewDataHydrator';

/**
 * PreviewDataHydrator renders nothing — it's a side-effect-only bridge that
 * hydrates PreviewPanelContext from server-fetched profile data on pages
 * that need the contact/preview sidebar but don't already run
 * EnhancedDashboardLinks. This story proves the shared dashboard provider
 * stack (DashboardDataProvider + PreviewPanelProvider + RightPanelProvider)
 * mounts it without crashing; there's nothing to see.
 */
const initialLinks: ProfileSocialLink[] = [
  {
    id: 'link-1',
    platform: 'instagram',
    platformType: 'social',
    url: 'https://instagram.com/sashawaves',
    sortOrder: 0,
    isActive: true,
    displayText: null,
    state: 'active',
  },
  {
    id: 'link-2',
    platform: 'spotify',
    platformType: 'dsp',
    url: 'https://open.spotify.com/artist/sashawaves',
    sortOrder: 1,
    isActive: true,
    displayText: null,
    state: 'active',
  },
];

const connectedDSPs = [{ key: 'spotify' }] as unknown as AvailableDSP[];

const meta = {
  title: 'Dashboard/Organisms/PreviewDataHydrator',
  component: PreviewDataHydrator,
  parameters: {
    layout: 'centered',
  },
  decorators: [withDashboardProviders],
  args: {
    initialLinks,
    connectedDSPs,
  },
} satisfies Meta<typeof PreviewDataHydrator>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Mounted: Story = {
  render: args => (
    <div className='text-app text-tertiary-token'>
      Renders nothing — hydrates PreviewPanelContext on mount.
      <PreviewDataHydrator {...args} />
    </div>
  ),
};

export const NoLinks: Story = {
  args: {
    initialLinks: [],
    connectedDSPs: [],
  },
  render: args => (
    <div className='text-app text-tertiary-token'>
      Renders nothing — hydrates PreviewPanelContext on mount.
      <PreviewDataHydrator {...args} />
    </div>
  ),
};
