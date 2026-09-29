import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HandleStatusIcon } from './HandleStatusIcon';

const meta = {
  title: 'Features/Home/HandleStatusIcon',
  component: HandleStatusIcon,
  parameters: {
    layout: 'centered',
  },
  args: {
    handle: 'timwhite',
    showChecking: false,
    available: null,
    handleError: null,
    unavailable: false,
  },
} satisfies Meta<typeof HandleStatusIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Checking: Story = {
  args: {
    showChecking: true,
  },
};

export const Available: Story = {
  args: {
    available: true,
  },
};

export const Unavailable: Story = {
  args: {
    unavailable: true,
  },
};
