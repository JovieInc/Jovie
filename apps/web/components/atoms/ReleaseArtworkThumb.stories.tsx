import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ReleaseArtworkThumb } from './ReleaseArtworkThumb';

const meta = {
  title: 'Atoms/ReleaseArtworkThumb',
  component: ReleaseArtworkThumb,
  parameters: { layout: 'centered' },
  args: {
    src: 'https://placehold.co/640x640/111827/E5E7EB?text=Artwork',
    alt: 'Release artwork',
    size: 40,
  },
} satisfies Meta<typeof ReleaseArtworkThumb>;

export default meta;
export const Default: StoryObj<typeof meta> = {};
