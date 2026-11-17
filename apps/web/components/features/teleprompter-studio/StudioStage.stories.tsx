import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { CSSProperties } from 'react';
import {
  DEFAULT_RING_LIGHT,
  ringLightStyle,
} from '@/lib/teleprompter/ring-light';
import { StudioStage } from './StudioStage';

const meta = {
  title: 'Features/TeleprompterStudio/StudioStage',
  component: StudioStage,
  parameters: { layout: 'fullscreen', themes: { themeOverride: 'dark' } },
  decorators: [
    Story => (
      <div
        className='relative h-96 bg-base'
        style={ringLightStyle(DEFAULT_RING_LIGHT) as CSSProperties}
      >
        <Story />
      </div>
    ),
  ],
  args: { peek: false, between: false, grid: false },
} satisfies Meta<typeof StudioStage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Recording: Story = {};
export const WithGrid: Story = { args: { grid: true } };
export const BetweenTakes: Story = { args: { between: true } };
export const EmptyNoCamera: Story = { args: { peek: true } };
