import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ImportProgressBanner } from './ImportProgressBanner';

const meta = {
  title: 'Dashboard/Organisms/ReleaseProviderMatrix/ImportProgressBanner',
  component: ImportProgressBanner,
  parameters: {
    layout: 'padded',
  },
  args: {
    artistName: 'Sasha Waves',
    importedCount: 4,
    totalCount: 12,
  },
} satisfies Meta<typeof ImportProgressBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Importing: Story = {};

export const Enriching: Story = {
  args: {
    enrichmentStatus: 'enriching',
  },
};

export const Compact: Story = {
  args: {
    compact: true,
  },
};

export const UnknownTotal: Story = {
  args: {
    totalCount: 0,
    importedCount: 5,
  },
};
