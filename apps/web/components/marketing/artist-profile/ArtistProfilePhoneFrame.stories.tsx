import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { getMarketingExportImage } from '@/lib/screenshots/registry';
import { ArtistProfilePhoneFrame } from './ArtistProfilePhoneFrame';

const preview = getMarketingExportImage('tim-white-profile-live-mobile');

function PhoneScreen() {
  return (
    <img
      alt={preview.alt}
      className='h-full w-full object-cover object-top'
      src={preview.publicUrl}
    />
  );
}

const meta = {
  title: 'Marketing/Artist Profile/ArtistProfilePhoneFrame',
  component: ArtistProfilePhoneFrame,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='bg-base p-8 text-primary-token'>
        <Story />
      </div>
    ),
  ],
  args: {
    children: <PhoneScreen />,
  },
} satisfies Meta<typeof ArtistProfilePhoneFrame>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Large: Story = {};

export const Medium: Story = {
  args: {
    size: 'md',
  },
};

export const Small: Story = {
  args: {
    size: 'sm',
  },
};
