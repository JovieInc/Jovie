import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { LibraryShareDropCreator } from './LibraryShareDropCreator';

const meta = {
  title: 'Library/LibraryShareDropCreator',
  component: LibraryShareDropCreator,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['onCreated', 'disabled'],
    },
  },
} satisfies Meta<typeof LibraryShareDropCreator>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    releaseIds: ['release-story-1', 'release-story-2'],
    defaultTitle: 'Story drop',
  },
};

export const CuratedAssets: Story = {
  args: {
    releaseIds: ['release-story-1'],
    candidateAssets: [
      { id: 'release-story-1', title: 'Story single' },
      { id: 'release-story-2', title: 'Story live session' },
    ],
    defaultTitle: 'Story press kit',
  },
};
