import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { StatefulAssetSlot } from './StatefulAssetSlot';

const meta = {
  title: 'Library/StatefulAssetSlot',
  component: StatefulAssetSlot,
  parameters: { layout: 'centered' },
  args: {
    kind: 'artwork',
    occupancy: 'empty',
    cardinality: 'single',
    acquireMode: 'file',
    testIdPrefix: 'library-artwork',
    objectTitle: 'Artwork attached',
    acquireLabel: 'Drop artwork',
    accept: 'image/jpeg',
    disabled: false,
    onFile: () => undefined,
  },
} satisfies Meta<typeof StatefulAssetSlot>;

export default meta;
type Story = StoryObj<typeof meta>;

export const EmptyArtwork: Story = {};
export const PopulatedArtwork: Story = {
  args: { occupancy: 'populated', previewSrc: 'https://cdn.example.com/a.jpg' },
};
export const PopulatedStems: Story = {
  args: {
    kind: 'stems',
    occupancy: 'populated',
    cardinality: 'multi',
    acquireMode: 'action',
    testIdPrefix: 'library-stems',
    objectTitle: '2 stem files',
    acquireLabel: 'Add stems',
    addHref: '/app/releases/release-1/downloads',
    onFile: undefined,
  },
};
