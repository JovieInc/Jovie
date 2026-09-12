import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DisclosureRow } from './DisclosureRow';

const meta = {
  title: 'Molecules/Inspector/DisclosureRow',
  component: DisclosureRow,
  parameters: {
    layout: 'centered',
    jovie: { uncoveredProps: ['defaultOpen', 'testId'] },
  },
  args: {
    label: 'Rightsholders',
    summary: '2 observed',
    children: (
      <p className='text-2xs text-tertiary-token'>
        Public composition observations, not master ownership.
      </p>
    ),
  },
} satisfies Meta<typeof DisclosureRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const CollapsedRow: Story = {};
