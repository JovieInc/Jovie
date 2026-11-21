import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import type { PendingAudio } from '../hooks/useChatAudioAttachments';
import { AudioPreviewStrip } from './AudioPreviewStrip';

const audio: PendingAudio = {
  id: 'audio_1',
  name: 'sober-master.wav',
  mediaType: 'audio/wav',
  status: 'ready',
  releaseTitle: 'Sober',
};

const meta = {
  title: 'Jovie/Components/AudioPreviewStrip',
  component: AudioPreviewStrip,
  parameters: { layout: 'centered' },
  decorators: [
    function StripFrame(Story) {
      return (
        <div className='w-full max-w-md'>
          <Story />
        </div>
      );
    },
  ],
  args: { audio, onRemove: fn() },
} satisfies Meta<typeof AudioPreviewStrip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Loading: the file is uploading. */
export const LoadingUploading: Story = {
  args: { audio: { ...audio, status: 'uploading' } },
};

/** Empty: a ready file with no matched release shows the new-track copy. */
export const EmptyNoRelease: Story = {
  args: { audio: { ...audio, releaseTitle: undefined } },
};

/** Error: the upload failed with a reason. */
export const ErrorUploadFailed: Story = {
  args: {
    audio: { ...audio, status: 'failed', error: 'The file is too large.' },
  },
};

/** Long content: a long file name truncates. */
export const LongContentFileName: Story = {
  args: {
    audio: {
      ...audio,
      name: 'sober-final-master-v12-with-radio-edit-and-instrumental-alt-take.wav',
    },
  },
};

/** Rtl: the strip mirrors in a right-to-left layout. */
export const RtlStrip: Story = {
  args: { audio: { ...audio, name: 'ملف-صوتي.wav' } },
  decorators: [
    function RtlFrame(Story) {
      return (
        <div dir='rtl' className='w-full max-w-md'>
          <Story />
        </div>
      );
    },
  ],
};
