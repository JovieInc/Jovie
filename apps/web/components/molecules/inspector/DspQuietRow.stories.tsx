import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DspQuietRow } from './DspQuietRow';

const meta = {
  title: 'Molecules/Inspector/DspQuietRow',
  component: DspQuietRow,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['closedTabIndex'],
    },
  },
  decorators: [
    Story => (
      <div className='w-72'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DspQuietRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const LinkedRow: Story = {
  args: {
    label: 'Spotify',
    href: 'https://open.spotify.com/album/example',
    icon: <span aria-hidden='true'>S</span>,
  },
};

export const MissingRowWithFind: Story = {
  args: {
    label: 'Apple Music',
    icon: <span aria-hidden='true'>A</span>,
    onFind: () => undefined,
  },
};

export const DisabledFind: Story = {
  args: {
    label: 'Deezer',
    icon: <span aria-hidden='true'>D</span>,
    onFind: () => undefined,
    findLabel: 'Find',
    className: 'opacity-60',
  },
};
