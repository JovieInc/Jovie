import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SmartLinkAudioPreview } from './SmartLinkAudioPreview';

const meta = {
  title: 'Features/Release/SmartLinkAudioPreview',
  component: SmartLinkAudioPreview,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['disabled'],
    },
  },
  args: {
    contentId: 'preview-track-1',
    title: 'Never Say A Word',
    artistName: 'Jovie Artist',
    artworkUrl: 'https://placehold.co/640x640/111827/E5E7EB?text=Artwork',
    previewUrl: 'https://cdn.example.com/preview.mp3',
  },
} satisfies Meta<typeof SmartLinkAudioPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const FallbackSource: Story = {
  args: {
    previewVerification: 'fallback',
    previewSource: 'spotify',
  },
};

export const NoPreview: Story = {
  args: {
    previewUrl: null,
  },
};
