import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { WrappedDSPButton, WrappedSocialLink } from './WrappedSocialLink';

const meta: Meta<typeof WrappedSocialLink> = {
  title: 'Molecules/WrappedSocialLink',
  component: WrappedSocialLink,
  tags: ['autodocs'],
  argTypes: {
    platform: { control: 'text' },
  },
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    href: '/listen',
    platform: 'instagram',
  },
};

export const DSPButton: Story = {
  render: () => (
    <WrappedDSPButton href='/music' platform='spotify'>
      <span className='text-sm font-medium'>Listen on Spotify</span>
    </WrappedDSPButton>
  ),
};
