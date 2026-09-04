import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HomeChapter3 } from './HomeChapter3';

const meta = {
  title: 'Marketing/Sections/HomeChapter3',
  component: HomeChapter3,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof HomeChapter3>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
