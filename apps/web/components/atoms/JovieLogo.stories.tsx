import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { JovieLogo } from './JovieLogo';

const meta: Meta<typeof JovieLogo> = {
  title: 'Atoms/JovieLogo',
  component: JovieLogo,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'radio',
      options: ['light', 'dark'],
    },
    size: {
      control: 'radio',
      options: ['sm', 'md'],
    },
    showText: { control: 'boolean' },
  },
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithText: Story = {
  args: {
    showText: true,
  },
};

export const DarkVariant: Story = {
  args: {
    variant: 'dark',
    showText: true,
  },
};
