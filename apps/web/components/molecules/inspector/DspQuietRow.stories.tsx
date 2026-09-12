import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DspQuietRow } from './DspQuietRow';

const meta = {
  title: 'Molecules/Inspector/DspQuietRow',
  component: DspQuietRow,
  parameters: {
    layout: 'centered',
    jovie: { uncoveredProps: ['closedTabIndex', 'testId'] },
  },
  args: {
    label: 'Spotify',
    href: 'https://open.spotify.com/album/example',
    icon: <span aria-hidden='true'>S</span>,
    onFind: () => undefined,
    findLabel: 'Find',
  },
} satisfies Meta<typeof DspQuietRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const LinkedRow: Story = {};
