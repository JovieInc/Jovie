import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AuthBrandPanel } from './AuthBrandPanel';

const meta = {
  title: 'Features/Auth/AuthBrandPanel',
  component: AuthBrandPanel,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof AuthBrandPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
