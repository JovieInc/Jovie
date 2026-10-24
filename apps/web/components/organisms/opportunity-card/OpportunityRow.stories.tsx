import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { OpportunityRow } from './OpportunityRow';

const meta: Meta<typeof OpportunityRow> = {
  title: 'Organisms/OpportunityCard/OpportunityRow',
  component: OpportunityRow,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      // OpportunityRow renders an li; give the story a real list parent
      // (axe listitem).
      <ul className='m-0 w-[min(48rem,calc(100vw-2rem))] list-none bg-base p-4'>
        <Story />
      </ul>
    ),
  ],
  args: {
    id: 'brand-deal-backstage-verified',
    state: 'new',
    title: 'Creator-performance pilot for Example Brand',
    metadata:
      '$7.5k-$12.5k · Alex Buyer @ Example Brand · Backstage · verified · score 75.0 · 90-day organic usage, no exclusivity',
    primaryActionLabel: 'Approve buyer',
    onPrimaryAction: () => undefined,
    onDismiss: () => undefined,
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const VerifiedBrandDeal: Story = {};
