import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { withDashboardProviders } from '@/.storybook/dashboard-fixtures';
import type { ProfileSocialLink } from '@/app/app/(shell)/dashboard/actions/social-links';
import { PreviewDataHydrator } from './PreviewDataHydrator';

/**
 * State coverage for PreviewDataHydrator, which renders nothing and only
 * hydrates PreviewPanelContext. Same provider stack as the canonical stories.
 */
const meta = {
  title: 'Dashboard/Organisms/PreviewDataHydrator States',
  component: PreviewDataHydrator,
  parameters: {
    layout: 'centered',
  },
  decorators: [withDashboardProviders],
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
} satisfies Meta<typeof PreviewDataHydrator>;

export default meta;
type Story = StoryObj<typeof meta>;

const pendingOnly: ProfileSocialLink[] = [
  {
    id: 'link-suggested',
    platform: 'tiktok',
    platformType: 'social',
    url: 'https://tiktok.com/@sashawaves',
    sortOrder: 0,
    isActive: true,
    displayText: null,
    state: 'suggested',
  },
  {
    id: 'link-rejected',
    platform: 'twitter',
    platformType: 'social',
    url: 'https://x.com/sashawaves',
    sortOrder: 1,
    isActive: true,
    displayText: null,
    state: 'rejected',
  },
];

/** Empty: only suggested and rejected links, so the preview hydrates with none. */
export const EmptyOnlyPendingLinks: Story = {
  args: { initialLinks: pendingOnly },
};
