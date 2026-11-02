import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { WaitlistRoleForm } from './WaitlistRoleForm';

const meta = {
  title: 'Features/Waitlist/WaitlistRoleForm',
  component: WaitlistRoleForm,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof WaitlistRoleForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
