import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { LeadTable } from './LeadTable';

const meta: Meta<typeof LeadTable> = {
  title: 'Admin/Tables/Leads',
  component: LeadTable,
  parameters: {
    layout: 'fullscreen',
    // `disabled` only exists on internal row-action buttons, not as a prop.
    jovie: { uncoveredProps: ['disabled'] },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {},
};
