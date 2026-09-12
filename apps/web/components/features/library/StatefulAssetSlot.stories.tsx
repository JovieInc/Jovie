import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { StatefulAssetSlot } from './StatefulAssetSlot';

const meta = {
  title: 'Library/StatefulAssetSlot',
  component: StatefulAssetSlot,
  parameters: { layout: 'centered' },
  decorators: [
    Story => (
      <div className='w-80 bg-surface-0 p-3'>
        <Story />
      </div>
    ),
  ],
  args: {
    kind: 'artwork',
    occupancy: 'empty',
    cardinality: 'single',
    acquireMode: 'file',
    testIdPrefix: 'library-artwork',
    objectTitle: 'Artwork attached',
    objectSubtitle: 'Cover art for this object.',
    acquireLabel: 'Drop artwork',
    acquireHint: 'JPEG, PNG, WebP, or AVIF.',
    accept: 'image/jpeg',
    disabled: false,
    onFile: () => undefined,
  },
} satisfies Meta<typeof StatefulAssetSlot>;

export default meta;
type Story = StoryObj<typeof meta>;

export const EmptyArtwork: Story = {};

export const PopulatedArtwork: Story = {
  args: {
    occupancy: 'populated',
    previewSrc: 'https://cdn.example.com/artwork.jpg',
  },
};

export const PopulatedStems: Story = {
  args: {
    kind: 'stems',
    occupancy: 'populated',
    cardinality: 'multi',
    acquireMode: 'action',
    testIdPrefix: 'library-stems',
    objectTitle: '2 stem files',
    objectSubtitle: 'Downloads, stems, and DJ promos.',
    acquireLabel: 'Add stems',
    addHref: '/app/releases/release-1/downloads',
    onFile: undefined,
  },
};

export const Disabled: Story = {
  args: {
    occupancy: 'populated',
    previewSrc: 'https://cdn.example.com/artwork.jpg',
    disabled: true,
  },
};
