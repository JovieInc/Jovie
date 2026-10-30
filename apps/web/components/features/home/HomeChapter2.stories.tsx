import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HomeChapter2 } from './HomeChapter2';

const meta = {
  title: 'Marketing/Sections/HomeChapter2',
  component: HomeChapter2,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof HomeChapter2>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
