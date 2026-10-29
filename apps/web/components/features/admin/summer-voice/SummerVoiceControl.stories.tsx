import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SummerVoiceControlView } from './SummerVoiceControl';

const noop = () => undefined;
const base = {
  status: 'idle' as const,
  errorCode: null,
  transcript: '',
  reply: '',
  lastTurnMs: null,
};

const meta = {
  title: 'Features/Admin/SummerVoice/SummerVoiceControl',
  component: SummerVoiceControlView,
  parameters: { layout: 'centered' },
  args: { state: base, start: noop, stop: noop },
} satisfies Meta<typeof SummerVoiceControlView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Idle: Story = {};
export const Connecting: Story = {
  args: { state: { ...base, status: 'connecting' } },
};
export const Listening: Story = {
  args: { state: { ...base, status: 'listening', lastTurnMs: 820 } },
};
export const Speaking: Story = {
  args: { state: { ...base, status: 'speaking', lastTurnMs: 820 } },
};
export const NotConfigured: Story = {
  args: {
    state: { ...base, status: 'error', errorCode: 'voice_not_configured' },
  },
};
export const MicrophoneDenied: Story = {
  args: { state: { ...base, status: 'error', errorCode: 'microphone_denied' } },
};
