import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { type ClusterChip, ClusterFilterChips } from './ClusterFilterChips';

const CLUSTERS: ClusterChip[] = [
  { slug: 'streaming', displayName: 'Streaming' },
  { slug: 'social', displayName: 'Social' },
  { slug: 'press', displayName: 'Press' },
];

function ControlledClusterFilterChips({
  clusters = CLUSTERS,
  initialSelected = [],
}: {
  readonly clusters?: readonly ClusterChip[];
  readonly initialSelected?: readonly string[];
}) {
  const [selectedSlugs, setSelectedSlugs] =
    useState<readonly string[]>(initialSelected);
  return (
    <ClusterFilterChips
      clusters={clusters}
      selectedSlugs={selectedSlugs}
      onChange={setSelectedSlugs}
    />
  );
}

const meta = {
  title: 'Dashboard/ReleaseTasks/ClusterFilterChips',
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof ControlledClusterFilterChips>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllSelected: Story = {
  render: () => <ControlledClusterFilterChips />,
};

export const OneFiltered: Story = {
  render: () => <ControlledClusterFilterChips initialSelected={['social']} />,
};

/** A release with no task clusters yet: the chip row is left out entirely. */
export const EmptyNoClusters: Story = {
  render: () => <ControlledClusterFilterChips clusters={[]} />,
};
