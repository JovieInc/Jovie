import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { fireEvent, within } from 'storybook/test';
import { getMarketingExportImage } from '@/lib/screenshots/registry';
import { TIM_WHITE_PROFILE } from '@/lib/tim-white';
import { ProfilePhotoContextMenu } from './ProfilePhotoContextMenu';

const avatarUrl = getMarketingExportImage(
  'tim-white-profile-live-mobile'
).publicUrl;

// The trigger is asChild, so the photo is a DOM element that takes its props.
const AVATAR = (
  <div
    data-testid='profile-photo'
    role='img'
    aria-label={`${TIM_WHITE_PROFILE.name} profile photo`}
    className='h-24 w-24 rounded-full bg-surface-2'
    style={{ backgroundImage: `url(${avatarUrl})`, backgroundSize: 'cover' }}
  />
);

function withRtl(Story: () => ReactNode) {
  return (
    <div dir='rtl' lang='ar'>
      <Story />
    </div>
  );
}

/** Opens the download menu the way a right-click does. */
async function openMenu({
  canvasElement,
}: {
  readonly canvasElement: HTMLElement;
}) {
  fireEvent.contextMenu(within(canvasElement).getByTestId('profile-photo'));
}

const meta = {
  title: 'Features/Profile/ProfilePhotoContextMenu States',
  component: ProfilePhotoContextMenu,
  parameters: {
    layout: 'centered',
  },
  args: {
    name: TIM_WHITE_PROFILE.name,
    handle: TIM_WHITE_PROFILE.handle,
    allowDownloads: true,
    sizes: [
      { key: 'original', label: 'Original', url: avatarUrl },
      { key: '400', label: '400 × 400', url: avatarUrl },
    ],
    children: AVATAR,
  },
} satisfies Meta<typeof ProfilePhotoContextMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no download sizes, so the photo renders with no menu. */
export const EmptySizes: Story = {
  args: { sizes: [] },
};

/** Long content: long size labels in the open download menu. */
export const LongContentSizeLabels: Story = {
  args: {
    sizes: [
      {
        key: 'original',
        label: 'Original upload, full resolution, uncompressed',
        url: avatarUrl,
      },
      {
        key: '1000',
        label: '1000 × 1000 square for press kits and streaming profiles',
        url: avatarUrl,
      },
      { key: '400', label: '400 × 400 square for social', url: avatarUrl },
    ],
  },
  play: openMenu,
};

/** RTL: the open download menu in a right-to-left document. */
export const RtlMenu: Story = {
  decorators: [withRtl],
  play: openMenu,
};
