import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { NewHowItWorks } from './NewHowItWorks';

const meta = {
  title: 'Marketing/NewHowItWorks',
  component: NewHowItWorks,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof NewHowItWorks>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
