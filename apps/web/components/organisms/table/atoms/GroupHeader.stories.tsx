import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { GroupHeader } from './GroupHeader';

const meta = {
  title: 'Organisms/Table/Atoms/GroupHeader',
  component: GroupHeader,
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
    label: 'New',
    count: 12,
    colSpan: 4,
  },
} satisfies Meta<typeof GroupHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const NotSticky: Story = {
  args: {
    isSticky: false,
  },
};
