import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { DevToolbar } from './DevToolbar';

const meta = {
  title: 'Features/Dev/DevToolbar',
  component: DevToolbar,
  parameters: {
    layout: 'fullscreen',
    jovie: {
      uncoveredProps: ['disabled', 'loading'],
    },
  },
  args: {
    env: 'preview',
    sha: 'd57e644360',
    version: '26.9.1',
    defaultHidden: true,
  },
} satisfies Meta<typeof DevToolbar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const HiddenByDefault: Story = {};
