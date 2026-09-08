import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DemoTimWhiteProfileSurface } from './DemoTimWhiteProfileSurface';

const meta = {
  title: 'Features/Demo/DemoTimWhiteProfileSurface',
  component: DemoTimWhiteProfileSurface,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof DemoTimWhiteProfileSurface>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
