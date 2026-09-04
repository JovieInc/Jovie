import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { JovieLogo } from './JovieLogo';

const meta = {
  title: 'Atoms/JovieLogo',
  component: JovieLogo,
  parameters: {
    layout: 'centered',
  },
  args: {
    href: '/',
    variant: 'light',
    size: 'md',
    showText: false,
  },
} satisfies Meta<typeof JovieLogo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Home: Story = {
  args: {
    showText: true,
  },
};

export const SmallWithText: Story = {
  args: {
    size: 'sm',
    showText: true,
  },
};

export const ArtistProfile: Story = {
  args: {
    artistHandle: 'demo-artist',
  },
};

export const ProfileInvitation: Story = {
  args: {
    artistHandle: 'demo-artist',
    showText: true,
    size: 'sm',
  },
};

export const DarkSurface: Story = {
  render: () => (
    <div className='dark rounded-lg bg-surface-0 p-6 text-primary-token'>
      <JovieLogo variant='dark' showText />
    </div>
  ),
};

export const NonInteractive: Story = {
  args: {
    href: '',
    title: 'Jovie wordmark',
    showText: true,
  },
};
