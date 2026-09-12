import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DisclosureRow } from './DisclosureRow';

const meta = {
  title: 'Molecules/Inspector/DisclosureRow',
  component: DisclosureRow,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['defaultOpen', 'testId'],
    },
  },
  args: {
    label: 'Rightsholders',
    summary: '2 observed',
  },
  decorators: [
    Story => (
      <div className='w-80'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DisclosureRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const CollapsedRow: Story = {
  args: {
    children: (
      <p className='text-2xs text-tertiary-token'>
        Songview and MLC are public composition observations, not proof of
        master ownership.
      </p>
    ),
  },
};

export const OpenRow: Story = {
  args: {
    defaultOpen: true,
    children: (
      <p className='text-2xs text-tertiary-token'>
        Songview and MLC are public composition observations, not proof of
        master ownership.
      </p>
    ),
  },
};
