import '@/styles/system-b-app.css';
import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { FounderReviewRecorderControls } from './FounderReviewRecorderControls';
import { Idle } from './FounderReviewRecorderControls.stories';

/** Rendered states of the founder review recorder. */
const meta = {
  title: 'Dashboard/Opportunity Inbox/Founder Review Recorder Controls/States',
  component: FounderReviewRecorderControls,
  parameters: { layout: 'padded' },
  args: Idle.args,
} satisfies Meta<typeof FounderReviewRecorderControls>;

export default meta;
type Story = StoryObj<typeof meta>;

const withRecorderWidth: Decorator = function WithRecorderWidth(Story) {
  return (
    <div className='w-full max-w-2xl'>
      <Story />
    </div>
  );
};

const withRtlDocument: Decorator = function WithRtlDocument(Story) {
  return (
    <div dir='rtl' lang='ar' className='w-full max-w-2xl'>
      <Story />
    </div>
  );
};

/** Empty: no transcript or note yet, so the placeholder line shows. */
export const EmptyTranscript: Story = {
  decorators: [withRecorderWidth],
};

/** Permission denied: the microphone was refused; typed notes still work. */
export const PermissionDeniedMicrophone: Story = {
  args: {
    error: 'Microphone permission was denied. Typed notes still work.',
    typedText: 'Approve: the new thumbnail reads better at feed size.',
  },
  decorators: [withRecorderWidth],
};

/** Long content: a transcript past the three-line clamp and a long note. */
export const LongContentTranscript: Story = {
  args: {
    sessionActive: true,
    transcript:
      'Approve this one. The new thumbnail reads better at feed size, the title is shorter, the face is larger and the contrast holds on a phone in bright light. Also pull the old cover art from the playlist pitch and swap the release date in the description, then check the end screen links still point at the smart link rather than the old pre-save page.',
    typedText:
      'Follow up with the label about the remix stems before the next upload, and ask whether the lyric video can ship the same week.',
  },
  decorators: [withRecorderWidth],
};

/** Right-to-left: an Arabic transcript and note in an Arabic document. */
export const RtlArabicTranscript: Story = {
  args: {
    transcript: 'وافق على هذه الصورة المصغرة، فهي أوضح بحجم الخلاصة.',
    typedText: 'أزل غلاف الألبوم القديم.',
  },
  decorators: [withRtlDocument],
};
