import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { RailStagedContent } from './RailStagedContent';

const meta = {
  title: 'Shell/RailStagedContent',
  component: RailStagedContent,
  parameters: {
    layout: 'centered',
  },
  args: {
    hidden: false,
    children: (
      <div className='text-app text-secondary-token'>
        Staged rail chrome content
      </div>
    ),
  },
} satisfies Meta<typeof RailStagedContent>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Visible: Story = {};

export const Hidden: Story = {
  args: {
    hidden: true,
  },
};
