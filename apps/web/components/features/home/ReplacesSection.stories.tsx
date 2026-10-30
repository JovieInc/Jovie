import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ReplacesSection } from './ReplacesSection';

const meta = {
  title: 'Marketing/ReplacesSection',
  component: ReplacesSection,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof ReplacesSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => <ReplacesSection />,
};
