import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { MusicImportHero } from './MusicImportHero';

const meta = {
  title: 'Features/Dashboard/Organisms/MusicImportHero',
  component: MusicImportHero,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['ingestionStatus', 'releases', 'isLoading'],
    },
  },
} satisfies Meta<typeof MusicImportHero>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    ingestionStatus: 'idle',
    releases: [
      {
        id: 'release-1',
        title: 'Skyline Dreams',
        artworkUrl: null,
        releaseDate: '2026-01-01',
        releaseType: 'single',
      },
    ],
    isLoading: false,
  },
};
