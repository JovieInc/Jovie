import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { StudioAnswerCue, StudioQuestion } from './StudioQuestion';

const meta = {
  title: 'Features/TeleprompterStudio/StudioQuestion',
  component: StudioQuestion,
  parameters: { layout: 'fullscreen', themes: { themeOverride: 'dark' } },
  decorators: [
    Story => (
      <div className='min-h-96 bg-base px-12 text-primary-token'>
        <Story />
      </div>
    ),
  ],
  args: {
    question: 'What were you feeling the night you wrote it?',
    voiceStatus:
      'Voice off on laptop speakers. Plug in headphones to hear her.',
    voiceEnabled: false,
    onAnswer: () => {},
    onNextQuestion: () => {},
    onBackToScript: () => {},
  },
} satisfies Meta<typeof StudioQuestion>;

export default meta;
type Story = StoryObj<typeof meta>;

export const VoiceMuted: Story = {};
export const VoiceOn: Story = {
  args: { voiceEnabled: true, voiceStatus: 'Jovie reads each question aloud.' },
};
export const Answering: Story = {
  render: args => <StudioAnswerCue question={args.question} />,
};
export const EmptyQuestion: Story = { args: { question: '' } };
export const LongQuestion: Story = {
  args: {
    question:
      'When you were driving home that night with the windows down and the city finally quiet, what was the one line you kept singing to yourself before you ever wrote the rest of the song?',
    voiceStatus:
      'Voice off on laptop speakers so the mic does not hear it. Plug in headphones or AirPods to hear each question read aloud.',
  },
};
export const Rtl: Story = {
  render: args => (
    <div dir='rtl'>
      <StudioQuestion {...args} />
    </div>
  ),
};
