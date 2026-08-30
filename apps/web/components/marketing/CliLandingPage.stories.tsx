import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { CliLandingPage } from './CliLandingPage';

const meta = {
  title: 'Marketing/CliLandingPage',
  component: CliLandingPage,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof CliLandingPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
