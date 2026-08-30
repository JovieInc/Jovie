import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ArtworkThumb } from './ArtworkThumb';

const meta = {
  title: 'Shell/ArtworkThumb',
  component: ArtworkThumb,
  parameters: { layout: 'centered' },
  args: {
    src: 'https://placehold.co/640x640/111827/E5E7EB?text=Artwork',
    title: 'Never Say A Word',
    size: 40,
  },
} satisfies Meta<typeof ArtworkThumb>;

export default meta;
export const Default: StoryObj<typeof meta> = {};
