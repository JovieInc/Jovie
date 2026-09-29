import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { DspAvatarItem } from './DspAvatarStack';
import { DspAvatarStack } from './DspAvatarStack';

const dsps: DspAvatarItem[] = [
  {
    id: 'spotify',
    status: 'live',
    label: 'Spotify',
    glyph: 'S',
    color: '#1DB954',
  },
  {
    id: 'apple',
    status: 'pending',
    label: 'Apple Music',
    glyph: 'A',
    color: '#FA243C',
  },
  {
    id: 'youtube',
    status: 'error',
    label: 'YouTube Music',
    glyph: 'Y',
    color: '#FF0000',
  },
  {
    id: 'tidal',
    status: 'missing',
    label: 'Tidal',
    glyph: 'T',
    color: '#000000',
  },
];

const meta = {
  title: 'Shell/DspAvatarStack',
  component: DspAvatarStack,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='bg-base p-8'>
        <Story />
      </div>
    ),
  ],
  args: {
    dsps,
  },
} satisfies Meta<typeof DspAvatarStack>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const MultipleVisible: Story = {
  args: {
    maxVisible: 3,
  },
};

export const AllLive: Story = {
  args: {
    dsps: dsps.map(d => ({ ...d, status: 'live' })),
    maxVisible: 4,
  },
};

export const Empty: Story = {
  args: {
    dsps: [],
  },
};
