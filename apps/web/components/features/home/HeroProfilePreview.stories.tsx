import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HeroProfilePreview } from './HeroProfilePreview';

const meta = {
  title: 'Features/Home/HeroProfilePreview',
  component: HeroProfilePreview,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof HeroProfilePreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
