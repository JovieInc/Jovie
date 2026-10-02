import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { UnavailablePage } from './UnavailablePage';

const meta = {
  title: 'UnavailablePage',
  component: UnavailablePage,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof UnavailablePage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
