import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DemoReleasePresaveSurface } from './DemoReleasePresaveSurface';

const meta = {
  title: 'Features/Demo/DemoReleasePresaveSurface',
  component: DemoReleasePresaveSurface,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof DemoReleasePresaveSurface>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
