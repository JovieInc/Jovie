import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';
import { DisclosureRow } from './DisclosureRow';

const meta = {
  title: 'Molecules/Inspector/DisclosureRow',
  decorators: [
    Story => (
      <div className='w-80 max-w-full'>
        <Story />
      </div>
    ),
  ],
  component: DisclosureRow,
  parameters: {
    layout: 'centered',
    chromatic: { viewports: [390, 1024] },
    jovie: { uncoveredProps: ['testId'] },
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

export const CollapsedRow: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button')).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    await expect(
      canvas.queryByText(/Public composition/)
    ).not.toBeInTheDocument();
  },
};

export const ExpandedRow: Story = {
  args: { defaultOpen: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/Public composition/)).toBeVisible();
    await userEvent.click(canvas.getByRole('button'));
    await expect(
      canvas.queryByText(/Public composition/)
    ).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button'));
    await expect(canvas.getByText(/Public composition/)).toBeVisible();
  },
};

export const WithoutSummary: Story = {
  args: { summary: undefined },
};
