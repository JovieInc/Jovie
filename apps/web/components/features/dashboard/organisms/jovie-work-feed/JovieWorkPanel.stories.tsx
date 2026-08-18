import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { JovieWorkPanelView } from './JovieWorkPanel';

const meta = {
  title: 'Dashboard/Jovie Work/Workspace',
  component: JovieWorkPanelView,
  parameters: { layout: 'fullscreen' },
  args: { profileId: undefined },
  render: args => (
    <div className='flex h-[42rem] bg-base'>
      <JovieWorkPanelView {...args} />
    </div>
  ),
} satisfies Meta<typeof JovieWorkPanelView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NoProfile: Story = {};

export const NoProfileNarrow: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
};
