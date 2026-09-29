import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { FormError } from './FormError';

const meta = {
  title: 'Features/Auth/FormError',
  component: FormError,
  parameters: {
    layout: 'centered',
  },
  args: {
    message: 'That email address is already in use.',
  },
} satisfies Meta<typeof FormError>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const NoMessage: Story = {
  args: {
    message: null,
  },
};
