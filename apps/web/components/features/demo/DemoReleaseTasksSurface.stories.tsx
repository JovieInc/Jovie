import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DemoReleaseTasksSurface } from './DemoReleaseTasksSurface';

const meta = {
  title: 'Demo/Release tasks',
  component: DemoReleaseTasksSurface,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof DemoReleaseTasksSurface>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SampleSchedule: Story = {};
