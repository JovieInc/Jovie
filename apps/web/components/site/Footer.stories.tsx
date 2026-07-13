import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Footer } from './Footer';

const meta: Meta<typeof Footer> = {
  title: 'Site/Footer',
  component: Footer,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  argTypes: {
    version: {
      control: 'inline-radio',
      options: ['minimal', 'regular'],
    },
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Minimal: Story = {
  name: 'Version 1 – Minimal',
  args: {
    version: 'minimal',
  },
};

export const Regular: Story = {
  name: 'Version 2 – Regular (Clerk-style)',
  args: {
    version: 'regular',
  },
};
