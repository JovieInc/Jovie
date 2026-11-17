import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { StudioHeader } from './StudioHeader';

const meta = {
  title: 'Features/TeleprompterStudio/StudioHeader',
  component: StudioHeader,
  parameters: { layout: 'padded', themes: { themeOverride: 'dark' } },
  args: {
    title: 'Release day shout-out',
    isRecording: false,
    takeNumber: 1,
    elapsedMs: 0,
    savedCount: 0,
    follow: { voice: true, label: 'Following your voice' },
    onClose: () => {},
  },
} satisfies Meta<typeof StudioHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = {};
export const Recording: Story = {
  args: { isRecording: true, takeNumber: 3, elapsedMs: 42_000 },
};
export const Saved: Story = {
  args: {
    savedCount: 2,
    follow: { voice: false, label: '130 words a minute' },
  },
};
export const EmptyNoTakesSaved: Story = { args: { savedCount: 0 } };
export const LongTitle: Story = {
  args: {
    title:
      'Release day shout-out for Save the Night, the extended club mix with the live strings and the new spoken intro',
    follow: { voice: false, label: '220 words a minute' },
  },
};
export const Rtl: Story = {
  render: args => (
    <div dir='rtl'>
      <StudioHeader {...args} />
    </div>
  ),
};
