import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DemoReleaseTrackedLinksSurface } from './DemoReleaseTrackedLinksSurface';

const meta = {
  title: 'Features/Demo/ReleaseTrackedLinks',
  component: DemoReleaseTrackedLinksSurface,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof DemoReleaseTrackedLinksSurface>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Founder demo surface: release row credits render via the canonical formatter. */
export const Default: Story = {};
