import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { TableIssueSummary } from './TableIssueSummary';

const meta = {
  title: 'Organisms/Table/TableIssueSummary',
  component: TableIssueSummary,
  args: {
    issues: [
      { label: 'No artwork' },
      { label: 'No providers' },
      { label: 'No UPC' },
      { label: '0 tracks' },
    ],
  },
} satisfies Meta<typeof TableIssueSummary>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Empty: Story = { args: { issues: [] } };
