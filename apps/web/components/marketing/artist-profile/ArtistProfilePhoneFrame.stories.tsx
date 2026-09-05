import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import Image from 'next/image';
import { getMarketingExportImage } from '@/lib/screenshots/registry';
import { ArtistProfilePhoneFrame } from './ArtistProfilePhoneFrame';

const PROFILE = getMarketingExportImage('tim-white-profile-listen-mobile');

const meta = {
  title: 'Marketing/Artist Profile/ArtistProfilePhoneFrame',
  component: ArtistProfilePhoneFrame,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='min-h-screen bg-base p-8 text-primary-token'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ArtistProfilePhoneFrame>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: (
      <Image
        alt={PROFILE.alt}
        height={PROFILE.height}
        src={PROFILE.publicUrl}
        width={PROFILE.width}
      />
    ),
  },
};
