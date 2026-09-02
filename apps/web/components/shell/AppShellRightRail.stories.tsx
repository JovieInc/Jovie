import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AppShellRightRail } from './AppShellRightRail';

const meta = {
  title: 'Shell/AppShellRightRail',
  component: AppShellRightRail,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof AppShellRightRail>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
