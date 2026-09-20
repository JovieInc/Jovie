import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ClaimHandleForm } from './ClaimHandleForm';

const meta = {
  title: 'Marketing/Forms/ClaimHandleForm',
  component: ClaimHandleForm,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof ClaimHandleForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Hero: Story = {
  args: { size: 'hero' },
};

export const Display: Story = {
  args: { size: 'display', hideHelperText: true },
};
