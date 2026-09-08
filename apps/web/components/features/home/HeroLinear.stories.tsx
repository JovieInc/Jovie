import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HeroLinear } from './HeroLinear';

const meta = {
  title: 'Marketing/Sections/HeroLinear',
  component: HeroLinear,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof HeroLinear>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
