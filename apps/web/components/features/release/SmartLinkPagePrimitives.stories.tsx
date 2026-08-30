import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SmartLinkArtworkCard } from './SmartLinkPagePrimitives';

const meta = {
  title: 'Release/SmartLinkArtworkCard',
  component: SmartLinkArtworkCard,
  parameters: {
    layout: 'centered',
    jovie: { uncoveredProps: ['name', 'handle'] },
  },
  args: {
    title: 'Never Say A Word',
    artworkUrl: '/art.jpg',
  },
} satisfies Meta<typeof SmartLinkArtworkCard>;

export default meta;
export const Default: StoryObj<typeof meta> = {};
