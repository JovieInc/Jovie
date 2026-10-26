import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ButtonSpinner } from './ButtonSpinner';

const meta = {
  title: 'Auth/ButtonSpinner',
  component: ButtonSpinner,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof ButtonSpinner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
