import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DemoHomepageMomentSurface } from './DemoHomepageMomentSurface';

const meta = {
  title: 'Features/Demo/DemoHomepageMomentSurface',
  component: DemoHomepageMomentSurface,
  parameters: {
    layout: 'fullscreen',
    nextjs: { appDirectory: true },
  },
} satisfies Meta<typeof DemoHomepageMomentSurface>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The smart link chooser, the default moment. */
export const SmartLink: Story = {
  parameters: {
    nextjs: {
      appDirectory: true,
      navigation: { query: { moment: 'smart-link' } },
    },
  },
};

/** The Get Updates email step. */
export const Capture: Story = {
  parameters: {
    nextjs: {
      appDirectory: true,
      navigation: { query: { moment: 'capture' } },
    },
  },
};
