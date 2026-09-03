import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { TableToolbar } from './TableToolbar';

const meta = {
  title: 'Features/Dashboard/Organisms/Table/TableToolbar',
  component: TableToolbar,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['totalCount'],
    },
  },
} satisfies Meta<typeof TableToolbar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
