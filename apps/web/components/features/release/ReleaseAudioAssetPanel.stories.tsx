import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ReleaseAudioAssetPanel } from './ReleaseAudioAssetPanel';

const meta = {
  title: 'Features/Release/ReleaseAudioAssetPanel',
  component: ReleaseAudioAssetPanel,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['releaseId', 'releaseTitle'],
    },
  },
} satisfies Meta<typeof ReleaseAudioAssetPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
