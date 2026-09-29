import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AuthAppleIcon } from './AuthAppleIcon';

const meta = {
  title: 'Features/Auth/AuthAppleIcon',
  component: AuthAppleIcon,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof AuthAppleIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
