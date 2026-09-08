import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HeroScrollSection } from './HeroScrollSection';

const meta = {
  title: 'Marketing/Sections/HeroScrollSection',
  component: HeroScrollSection,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof HeroScrollSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
