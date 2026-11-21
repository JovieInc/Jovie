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

/** Partial: a track chip with no thumbnail falls back to the accent dot. */
export const PartialNoThumbnail: Story = {
  args: {
    data: { kind: 'track', id: 'track_2', label: 'Daylight' },
    variant: 'transcript',
  },
};

/** Long content: a label past the chip width truncates. */
export const LongContentTruncated: Story = {
  args: {
    data: {
      kind: 'release',
      id: 'rel_long',
      label:
        'Midnight Drive (Extended Club Mix featuring a very long list of guest artists)',
    },
    onRemove: fn(),
  },
  decorators: [
    function NarrowFrame(Story) {
      return (
        <div className='w-56'>
          <Story />
        </div>
      );
    },
  ],
};

/** Rtl: a right-to-left label keeps the remove button at the inline end. */
export const RtlLabel: Story = {
  args: {
    data: { kind: 'release', id: 'rel_rtl', label: 'قيادة منتصف الليل' },
    onRemove: fn(),
  },
  decorators: [
    function RtlFrame(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
