import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ViewTable } from './ViewTable';

const meta = {
  title: 'Features/Views/ViewTable',
  component: ViewTable,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  args: {
    caption: 'Fans by city',
    columns: [
      { key: 'city', label: 'City' },
      { key: 'fans', label: 'Fans' },
    ],
    rows: [
      { city: 'Los Angeles', fans: 120 },
      { city: 'Berlin', fans: 88 },
      { city: 'Tokyo', fans: null },
    ],
  },
} satisfies Meta<typeof ViewTable>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Empty: Story = { args: { rows: [] } };
