import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  CollapsedContent,
  ExpandedContent,
  PillIcon,
  PillShimmer,
  TrailingContent,
} from './PlatformPill.parts';

/**
 * PlatformPill.parts holds the sub-components extracted from PlatformPill to
 * keep its cognitive complexity down. Storied here directly since they are
 * not exported from the parent's public API.
 */
const meta = {
  title: 'Dashboard/Atoms/PlatformPill.parts',
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof ExpandedContent>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Icon: Story = {
  render: () => (
    <PillIcon platformIcon='spotify' style={{ color: '#1ed760' }} />
  ),
};

export const Shimmer: Story = {
  render: () => (
    <div className='relative h-8 w-32 rounded-full border border-subtle'>
      <PillShimmer show />
    </div>
  ),
};

export const Collapsed: Story = {
  render: () => (
    <div className='group/pill flex w-40 items-center rounded-full border border-subtle p-1'>
      <CollapsedContent defaultExpanded={false} primaryText='Spotify' />
    </div>
  ),
};

export const Expanded: Story = {
  render: () => (
    <div className='w-56 rounded-full border border-subtle p-1'>
      <ExpandedContent
        primaryText='Spotify'
        secondaryText='artist.spotify.com/12345'
        badgeText='New'
      />
    </div>
  ),
};

export const Trailing: Story = {
  render: () => (
    <TrailingContent collapsed={false}>
      <span className='text-xs text-tertiary-token'>2.3M</span>
    </TrailingContent>
  ),
};
