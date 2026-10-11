import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SkeletonRow } from './SkeletonRow';

const meta = {
  title: 'Organisms/Table/Atoms/SkeletonRow',
  component: SkeletonRow,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <table className='w-96'>
        <tbody>
          <Story />
        </tbody>
      </table>
    ),
  ],
  args: {
    columns: 4,
  },
} satisfies Meta<typeof SkeletonRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithColumnConfig: Story = {
  args: {
    columns: 3,
    columnConfig: [
      { width: '48px', variant: 'avatar' },
      { width: '160px', variant: 'text' },
      { width: '80px', variant: 'badge' },
    ],
  },
};
