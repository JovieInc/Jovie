import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { RailStagedContent } from './RailStagedContent';

const meta = {
  title: 'Shell/RailStagedContent',
  component: RailStagedContent,
  parameters: { layout: 'centered' },
  decorators: [
    (Story, { args }) => (
      <div className='group w-64' data-collapsible={args.hidden ? 'icon' : ''}>
        <Story />
      </div>
    ),
  ],
  args: {
    hidden: false,
    children: <button type='button'>Rail action</button>,
  },
} satisfies Meta<typeof RailStagedContent>;

export default meta;
type Story = StoryObj<typeof meta>;
export const Expanded: Story = {};
export const Collapsed: Story = { args: { hidden: true } };
export const Unstaged: Story = { args: { stage: false } };
