import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AudienceWorkspaceSwitch } from './AudienceWorkspaceSwitch';

const meta = {
  title: 'Features/Dashboard/Molecules/AudienceWorkspaceSwitch/States',
  component: AudienceWorkspaceSwitch,
  parameters: {
    layout: 'padded',
    nextjs: { navigation: { pathname: '/app/audience' } },
  },
  args: { value: 'audience' },
} satisfies Meta<typeof AudienceWorkspaceSwitch>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Long content: the switch in a container narrower than its segments. */
export const LongContentNarrowContainer: Story = {
  decorators: [
    function NarrowFrame(Story) {
      return (
        <div className='w-40'>
          <Story />
        </div>
      );
    },
  ],
};

/** Rtl: the switch inside a right-to-left toolbar. */
export const RtlSwitch: Story = {
  decorators: [
    function RtlFrame(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
