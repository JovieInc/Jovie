import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { RedesignedHero } from './RedesignedHero';

const meta = {
  title: 'Marketing/RedesignedHero',
  component: RedesignedHero,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof RedesignedHero>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
