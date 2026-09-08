import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HomeSpecChapter } from './HomeSpecChapter';

const meta = {
  title: 'Marketing/Sections/HomeSpecChapter',
  component: HomeSpecChapter,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof HomeSpecChapter>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
