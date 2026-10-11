import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AddPlatformDialog } from './AddPlatformDialog';

const meta = {
  title: 'Dashboard/Organisms/DspPresence/AddPlatformDialog',
  component: AddPlatformDialog,
  parameters: {
    layout: 'centered',
  },
  args: {
    open: true,
    onClose: () => {},
    existingProviderIds: [],
  },
} satisfies Meta<typeof AddPlatformDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ProviderPicker: Story = {};

export const AllPlatformsLinked: Story = {
  args: {
    existingProviderIds: [
      'spotify',
      'apple_music',
      'deezer',
      'youtube_music',
      'tidal',
      'soundcloud',
      'amazon_music',
      'musicbrainz',
    ],
  },
};
