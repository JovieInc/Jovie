import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HomeAutoNotifySection } from './HomeAutoNotifySection';

const meta = {
  title: 'Marketing/Sections/HomeAutoNotifySection',
  component: HomeAutoNotifySection,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof HomeAutoNotifySection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
