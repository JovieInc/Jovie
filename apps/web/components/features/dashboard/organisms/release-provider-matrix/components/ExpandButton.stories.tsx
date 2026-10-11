import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ExpandButton } from './ExpandButton';

const meta = {
  title: 'Dashboard/Organisms/ReleaseProviderMatrix/ExpandButton',
  component: ExpandButton,
  parameters: {
    layout: 'centered',
  },
  args: {
    isExpanded: false,
    isLoading: false,
    totalTracks: 12,
    onClick: () => {},
  },
} satisfies Meta<typeof ExpandButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Collapsed: Story = {};

export const Expanded: Story = {
  args: {
    isExpanded: true,
  },
};

export const Loading: Story = {
  args: {
    isLoading: true,
  },
};

export const SingleTrack: Story = {
  args: {
    totalTracks: 1,
  },
};
