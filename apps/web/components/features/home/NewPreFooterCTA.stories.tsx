import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { NewPreFooterCTA } from './NewPreFooterCTA';

const meta = {
  title: 'Marketing/NewPreFooterCTA',
  component: NewPreFooterCTA,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof NewPreFooterCTA>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
