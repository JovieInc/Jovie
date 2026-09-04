import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SmartLinkArtwork } from './SmartLinkArtwork';

const meta = {
  title: 'Release/SmartLinkArtwork',
  component: SmartLinkArtwork,
  parameters: { layout: 'centered' },
  args: {
    src: 'https://placehold.co/640x640/111827/E5E7EB?text=Artwork',
    alt: 'Never Say A Word artwork',
    title: 'Never Say A Word',
  },
} satisfies Meta<typeof SmartLinkArtwork>;

export default meta;
export const Default: StoryObj<typeof meta> = {};
