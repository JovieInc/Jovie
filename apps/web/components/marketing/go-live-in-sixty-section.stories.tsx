import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { GoLiveInSixtySection } from './go-live-in-sixty-section';

const meta = {
  title: 'Marketing/Sections/GoLiveInSixtySection',
  component: GoLiveInSixtySection,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof GoLiveInSixtySection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
