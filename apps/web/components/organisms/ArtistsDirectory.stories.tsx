import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ArtistsDirectory } from './ArtistsDirectory';
import { ARTISTS_DIRECTORY_STORY_PROFILES } from './ArtistsDirectory.fixture';

const meta = {
  title: 'Public Catalog/ArtistsDirectory',
  component: ArtistsDirectory,
  parameters: {
    layout: 'fullscreen',
    pen: {
      registryId: 'web-155-artists',
      contractId: 'vPmnG',
      sourceSha: '0892cccf39d72c62890ad4bc797cfd6f2d651af6',
      receipts: {
        desktop: { id: 'eArgX', width: 1024, height: 1200 },
        narrow: { id: 't0iTE', width: 390, height: 844 },
      },
    },
    docs: {
      description: {
        component:
          'Deterministic production-body fixture for the /artists public catalog. The fixture uses the canonical Tim White public profile identity and keeps data fetching in the route, so Storybook never depends on a live database or invents artist links.',
      },
    },
  },
} satisfies Meta<typeof ArtistsDirectory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const DeterministicDirectory: Story = {
  args: {
    profiles: ARTISTS_DIRECTORY_STORY_PROFILES,
  },
};

export const EmptyDirectory: Story = {
  args: {
    profiles: [],
  },
};
