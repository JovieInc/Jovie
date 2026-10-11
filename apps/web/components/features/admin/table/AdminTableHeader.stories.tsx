import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AdminTableHeader, AdminTableSubheader } from './AdminTableHeader';

const meta = {
  title: 'Features/Admin/AdminTableHeader',
  component: AdminTableHeader,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    title: 'Creators',
    subtitle: '1,204 profiles claimed this month',
  },
} satisfies Meta<typeof AdminTableHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Header: Story = {};

export const Subheader: StoryObj<typeof AdminTableSubheader> = {
  render: () => (
    <AdminTableSubheader
      start={<span className='text-sm text-primary-token'>All creators</span>}
      end={<span className='text-sm text-secondary-token'>1,204 results</span>}
    />
  ),
};
