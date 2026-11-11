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
