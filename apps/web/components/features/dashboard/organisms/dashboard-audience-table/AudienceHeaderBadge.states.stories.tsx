import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import { AudienceHeaderBadge } from './AudienceHeaderBadge';
import type { AudienceView } from './types';

function AudienceHeaderBadgeDemo({
  totalAudienceCount,
  subscriberCount,
}: {
  readonly totalAudienceCount: number | null;
  readonly subscriberCount: number | null;
}) {
  const [view, setView] = useState<AudienceView>('all');
  return (
    <AudienceHeaderBadge
      view={view}
      onViewChange={setView}
      totalAudienceCount={totalAudienceCount}
      subscriberCount={subscriberCount}
    />
  );
}

/** State coverage for the audience view tabs. */
const meta = {
  title:
    'Dashboard/Organisms/DashboardAudienceTable/AudienceHeaderBadge States',
  component: AudienceHeaderBadgeDemo,
  parameters: { layout: 'padded' },
  args: { totalAudienceCount: 482, subscriberCount: 120 },
} satisfies Meta<typeof AudienceHeaderBadgeDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: a profile with no audience yet shows zero counts. */
export const EmptyAudience: Story = {
  args: { totalAudienceCount: 0, subscriberCount: 0 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('All (0)')).toBeVisible();
    await expect(canvas.getByText('Anonymous (0)')).toBeVisible();
  },
};

/** Long content: seven-digit counts scroll inside the tab rail. */
export const LongContentCounts: Story = {
  args: { totalAudienceCount: 12_345_678, subscriberCount: 2_345_678 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText('Anonymous (10000000)'));
    await expect(canvas.getByText('Anonymous (10000000)')).toBeVisible();
  },
};

/** Right-to-left: the tab rail inside an RTL document. */
export const RtlDocument: Story = {
  decorators: [
    function RtlDocumentDecorator(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
