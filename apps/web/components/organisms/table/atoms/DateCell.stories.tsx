import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DateCell } from './DateCell';

const meta = {
  title: 'Organisms/Table/Atoms/DateCell',
  component: DateCell,
  parameters: {
    layout: 'centered',
  },
  args: {
    date: new Date('2026-09-01T12:00:00.000Z'),
  },
} satisfies Meta<typeof DateCell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Empty: Story = {
  args: {
    date: null,
  },
};

export const CustomLocale: Story = {
  args: {
    locale: 'en-GB',
    formatOptions: { year: 'numeric', month: 'long', day: 'numeric' },
  },
};
