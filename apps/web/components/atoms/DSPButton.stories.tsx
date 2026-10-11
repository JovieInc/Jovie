import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { DSPButton } from './DSPButton';

const SPOTIFY_LOGO =
  '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="20" height="20"><circle cx="12" cy="12" r="10" fill="currentColor"/></svg>';

const meta = {
  title: 'Atoms/DSPButton',
  component: DSPButton,
  parameters: {
    layout: 'centered',
  },
  args: {
    name: 'Spotify',
    dspKey: 'spotify',
    url: 'https://open.spotify.com/artist/example',
    backgroundColor: '#1DB954',
    textColor: '#000000',
    logoSvg: SPOTIFY_LOGO,
    onClick: fn(),
  },
  decorators: [
    Story => (
      <div className='w-72'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DSPButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Small: Story = {
  args: {
    size: 'sm',
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
  },
};
