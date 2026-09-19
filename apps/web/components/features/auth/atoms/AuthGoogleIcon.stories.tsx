import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AuthGoogleIcon } from './AuthGoogleIcon';

const meta = {
  title: 'Auth/AuthGoogleIcon',
  component: AuthGoogleIcon,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof AuthGoogleIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FullColor: Story = {
  args: {
    className: 'h-4 w-4',
  },
};
