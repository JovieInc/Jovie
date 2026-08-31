import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { FounderDemoRecordingSurface } from './FounderDemoRecordingSurface';

const meta = {
  title: 'Features/Demo/FounderDemoRecordingSurface',
  component: FounderDemoRecordingSurface,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof FounderDemoRecordingSurface>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
