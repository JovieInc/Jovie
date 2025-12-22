import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Label } from './Label';

const meta: Meta<typeof Label> = {
  title: 'Atoms/Label',
  component: Label,
  tags: ['autodocs'],
  argTypes: {
    required: { control: 'boolean' },
    children: { control: 'text' },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    htmlFor: 'label-input',
    children: 'Email address',
  },
};

export const Required: Story = {
  args: {
    htmlFor: 'label-input',
    children: 'Password',
    required: true,
  },
};
