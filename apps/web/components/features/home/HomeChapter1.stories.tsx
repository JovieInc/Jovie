import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HomeChapter1 } from './HomeChapter1';

const meta = {
  title: 'Marketing/Sections/HomeChapter1',
  component: HomeChapter1,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof HomeChapter1>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
