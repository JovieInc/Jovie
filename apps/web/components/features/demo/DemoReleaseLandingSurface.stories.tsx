import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DemoReleaseLandingSurface } from './DemoReleaseLandingSurface';

const meta = {
  title: 'Features/Demo/DemoReleaseLandingSurface',
  component: DemoReleaseLandingSurface,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof DemoReleaseLandingSurface>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
