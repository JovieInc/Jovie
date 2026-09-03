import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SeeItInActionCarousel } from './SeeItInActionCarousel';

const meta = {
  title: 'Marketing/Sections/SeeItInActionCarousel',
  component: SeeItInActionCarousel,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof SeeItInActionCarousel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
