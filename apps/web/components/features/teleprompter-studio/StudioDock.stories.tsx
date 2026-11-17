import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { StudioDock } from './StudioDock';

const meta = {
  title: 'Features/TeleprompterStudio/StudioDock',
  component: StudioDock,
  parameters: { layout: 'centered', themes: { themeOverride: 'dark' } },
  args: {
    visible: true,
    isRecording: false,
    canRecord: true,
    between: false,
    followMode: 'voice',
    grid: false,
    peek: false,
    lightOpen: false,
    takesOpen: false,
    takeCount: 0,
    voiceEnabled: false,
    onSpeed: () => {},
    onToggleGrid: () => {},
    onTogglePeek: () => {},
    onToggleRecording: () => {},
    onToggleLight: () => {},
    onToggleVoice: () => {},
    onToggleTakes: () => {},
  },
} satisfies Meta<typeof StudioDock>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = {};
export const Recording: Story = {
  args: { isRecording: true, grid: true, takeCount: 2 },
};
export const PartialNoVoiceSupport: Story = {
  args: { voiceEnabled: undefined },
};
export const EmptyNoTakes: Story = { args: { takeCount: 0 } };
export const LongTakeCount: Story = { args: { takeCount: 128 } };
export const Rtl: Story = {
  render: args => (
    <div dir='rtl'>
      <StudioDock {...args} />
    </div>
  ),
};
