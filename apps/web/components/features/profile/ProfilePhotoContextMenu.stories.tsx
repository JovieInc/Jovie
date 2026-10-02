import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { getMarketingExportImage } from '@/lib/screenshots/registry';
import { TIM_WHITE_PROFILE } from '@/lib/tim-white';
import { ProfilePhotoContextMenu } from './ProfilePhotoContextMenu';

const avatarUrl = getMarketingExportImage(
  'tim-white-profile-live-mobile'
).publicUrl;

const meta = {
  title: 'Features/Profile/ProfilePhotoContextMenu',
  component: ProfilePhotoContextMenu,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Right-click on the avatar below to open the download-size context menu.',
      },
    },
  },
  args: {
    name: TIM_WHITE_PROFILE.name,
    handle: TIM_WHITE_PROFILE.handle,
    allowDownloads: true,
    sizes: [
      { key: 'original', label: 'Original', url: avatarUrl },
      { key: '400', label: '400 × 400', url: avatarUrl },
    ],
    children: (
      <div
        className='h-24 w-24 rounded-full bg-surface-2'
        style={{
          backgroundImage: `url(${avatarUrl})`,
          backgroundSize: 'cover',
        }}
      />
    ),
  },
} satisfies Meta<typeof ProfilePhotoContextMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithDownloads: Story = {};

export const NoDownloadsAllowed: Story = {
  args: {
    allowDownloads: false,
  },
};
