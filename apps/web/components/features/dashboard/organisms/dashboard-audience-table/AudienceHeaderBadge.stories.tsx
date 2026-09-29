import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { AudienceHeaderBadge } from './AudienceHeaderBadge';
import type { AudienceView } from './types';

function AudienceHeaderBadgeDemo({
  initialView = 'all',
  totalAudienceCount,
  subscriberCount,
}: {
  readonly initialView?: AudienceView;
  readonly totalAudienceCount: number | null;
  readonly subscriberCount: number | null;
}) {
  const [view, setView] = useState<AudienceView>(initialView);
  return (
    <AudienceHeaderBadge
      view={view}
      onViewChange={setView}
      totalAudienceCount={totalAudienceCount}
      subscriberCount={subscriberCount}
    />
  );
}

const meta = {
  title: 'Dashboard/Organisms/DashboardAudienceTable/AudienceHeaderBadge',
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof AudienceHeaderBadgeDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithCounts: Story = {
  render: () => (
    <AudienceHeaderBadgeDemo totalAudienceCount={482} subscriberCount={120} />
  ),
};

export const CountsPending: Story = {
  render: () => (
    <AudienceHeaderBadgeDemo totalAudienceCount={null} subscriberCount={null} />
  ),
};

export const IdentifiedSelected: Story = {
  render: () => (
    <AudienceHeaderBadgeDemo
      initialView='identified'
      totalAudienceCount={482}
      subscriberCount={120}
    />
  ),
};
