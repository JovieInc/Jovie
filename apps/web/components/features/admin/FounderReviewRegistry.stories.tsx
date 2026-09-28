import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { RightPanelProvider } from '@/contexts/RightPanelContext';
import type { FounderReviewItem } from '@/lib/admin/types';
import { founderReviewItemFixture } from '@/tests/fixtures/founder-review-item';
import { FounderReviewRegistry } from './FounderReviewRegistry';

const items: readonly FounderReviewItem[] = [
  founderReviewItemFixture({
    id: 'feature.ready',
    title: 'Ready feature',
    readiness: 'ready',
  }),
  founderReviewItemFixture({
    id: 'feature.collecting',
    title: 'Collecting feature',
    readiness: 'collecting',
  }),
];

const meta = {
  title: 'Features/Admin/FounderReviewRegistry',
  component: FounderReviewRegistry,
  parameters: {
    layout: 'fullscreen',
    jovie: { uncoveredProps: ['disabled'] },
  },
  decorators: [
    Story => (
      <RightPanelProvider>
        <Story />
      </RightPanelProvider>
    ),
  ],
  args: {
    kind: 'feature',
    items,
  },
} satisfies Meta<typeof FounderReviewRegistry>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FeatureRegistry: Story = {};
