import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DemoShowcaseSurface } from './DemoShowcaseSurface';

const meta = {
  title: 'Features/Demo/DemoShowcaseSurface',
  component: DemoShowcaseSurface,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    surface: 'releases',
  },
} satisfies Meta<typeof DemoShowcaseSurface>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Populated: Story = {};
