import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DrawerLoadingSkeleton } from './DrawerLoadingSkeleton';

const meta = {
  title: 'Molecules/Drawer/DrawerLoadingSkeleton States',
  component: DrawerLoadingSkeleton,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof DrawerLoadingSkeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: the release drawer while its details load. */
export const LoadingReleaseDetails: Story = {
  args: {
    ariaLabel: 'Loading release details',
  },
};
