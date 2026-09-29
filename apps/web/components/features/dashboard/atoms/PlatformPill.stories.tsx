import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { PlatformPill } from './PlatformPill';

const meta = {
  title: 'Dashboard/Atoms/PlatformPill',
  component: PlatformPill,
  parameters: {
    layout: 'centered',
  },
  args: {
    platformIcon: 'spotify',
    platformName: 'Spotify',
    primaryText: 'Spotify',
    secondaryText: 'artist.spotify.com/12345',
    state: 'connected',
  },
  argTypes: {
    state: {
      control: 'select',
      options: ['connected', 'ready', 'error', 'hidden', 'loading'],
    },
    tone: {
      control: 'select',
      options: ['default', 'faded'],
    },
  },
} satisfies Meta<typeof PlatformPill>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Connected: Story = {};

export const Ready: Story = {
  args: {
    state: 'ready',
    secondaryText: 'Not yet connected',
  },
};

export const ErrorState: Story = {
  args: {
    state: 'error',
    secondaryText: 'Connection failed',
  },
};

export const Faded: Story = {
  args: {
    tone: 'faded',
  },
};

export const Collapsed: Story = {
  args: {
    collapsed: true,
  },
};

export const Interactive: Story = {
  args: {
    onClick: () => {},
  },
};

export const WithBadgeAndTrailing: Story = {
  args: {
    badgeText: 'New',
    trailing: <span className='text-xs text-tertiary-token'>2.3M</span>,
  },
};

export const Stacked: Story = {
  render: () => (
    <div className='flex'>
      <PlatformPill
        platformIcon='spotify'
        platformName='Spotify'
        primaryText='Spotify'
        stackable
        defaultExpanded
      />
      <PlatformPill
        platformIcon='apple-music'
        platformName='Apple Music'
        primaryText='Apple Music'
        stackable
      />
      <PlatformPill
        platformIcon='youtube'
        platformName='YouTube'
        primaryText='YouTube'
        stackable
      />
    </div>
  ),
};
