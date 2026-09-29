import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { EntityChip } from './EntityChip';

const meta = {
  title: 'Jovie/EntityChip',
  component: EntityChip,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='bg-base p-3'>
        <Story />
      </div>
    ),
  ],
  args: {
    data: {
      kind: 'release',
      id: 'rel_1',
      label: 'Midnight Drive',
    },
  },
} satisfies Meta<typeof EntityChip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Artist: Story = {
  args: {
    data: { kind: 'artist', id: 'artist_1', label: 'Example Artist' },
  },
};

export const OnLightTone: Story = {
  args: {
    tone: 'onLight',
  },
};

export const Removable: Story = {
  args: {
    onRemove: fn(),
  },
};

export const WithThumbnail: Story = {
  args: {
    data: {
      kind: 'track',
      id: 'track_1',
      label: 'Daylight',
      thumbnail: 'https://placehold.co/32x32',
    },
  },
};
