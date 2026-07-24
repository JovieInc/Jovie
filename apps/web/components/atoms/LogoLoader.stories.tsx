import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { LogoLoader } from './LogoLoader';

const meta: Meta<typeof LogoLoader> = {
  title: 'Atoms/LogoLoader',
  component: LogoLoader,
  tags: ['autodocs'],
  argTypes: {
    size: { control: 'number' },
  },
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const CustomSize: Story = {
  args: {
    size: 48,
  },
};
