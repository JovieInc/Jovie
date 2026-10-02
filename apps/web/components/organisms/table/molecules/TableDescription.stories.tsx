import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { TableDescription } from './TableDescription';

const meta = {
  title: 'Organisms/Table/TableDescription',
  component: TableDescription,
  args: {
    label: 'Hosting notes',
    text: 'Usage includes application hosting, image processing, and scheduled jobs. This deliberately long description remains available in full through the disclosure without changing table row height.',
  },
} satisfies Meta<typeof TableDescription>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Empty: Story = { args: { text: '' } };
