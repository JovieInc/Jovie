import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DemoVideoPage } from './DemoVideoPage';

const meta = {
  title: 'Features/Demo/DemoVideoPage',
  component: DemoVideoPage,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof DemoVideoPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
