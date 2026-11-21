import '@/styles/system-b-app.css';
import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { userEvent, within } from 'storybook/test';
import { FounderReviewRecorder } from './FounderReviewRecorder';

/** Rendered states of the founder review recorder container. */
const meta = {
  title: 'Dashboard/Opportunity Inbox/Founder Review Recorder/States',
  component: FounderReviewRecorder,
  parameters: { layout: 'padded' },
  args: {
    target: {
      type: 'inbox-card' as const,
      id: 'card-1',
      title: 'Refresh a weak YouTube thumbnail',
      sourceKind: 'youtube.thumbnail_candidate',
      category: 'suggestion',
    },
    onApprove: () => {},
    onReject: () => {},
  },
} satisfies Meta<typeof FounderReviewRecorder>;

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

const withMicrophoneRefused: Decorator = function WithMicrophoneRefused(Story) {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: () =>
        Promise.reject(new DOMException('Denied', 'NotAllowedError')),
    },
  });
  return (
    <div className='w-full max-w-2xl'>
      <Story />
    </div>
  );
};

const withReceiptsOffline: Decorator = function WithReceiptsOffline(Story) {
  globalThis.fetch = () => Promise.reject(new TypeError('Network is offline'));
  return (
    <div className='w-full max-w-2xl'>
      <Story />
    </div>
  );
};

const withReceiptsPending: Decorator = function WithReceiptsPending(Story) {
  globalThis.fetch = () => new Promise<Response>(() => {});
  return (
    <div className='w-full max-w-2xl'>
      <Story />
    </div>
  );
};

/** Loading: the receipt history request never settles; the recorder stays usable. */
export const LoadingReceiptHistory: Story = {
  decorators: [withReceiptsPending],
};

/** Permission denied: the microphone was refused after pressing Start Session. */
export const PermissionDeniedMicrophone: Story = {
  decorators: [withMicrophoneRefused],
  play: async ({ canvasElement }) => {
    await userEvent.click(
      await within(canvasElement).findByRole('button', {
        name: 'Start Session',
      })
    );
  },
};

/** Error: a decision is refused by the receipt service and nothing is saved. */
export const ErrorReceiptNotSaved: Story = {
  decorators: [withReceiptsOffline],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      await canvas.findByLabelText('Notes'),
      'Approve: the thumbnail reads well at feed size.'
    );
    await userEvent.click(
      await canvas.findByRole('button', { name: 'Approve' })
    );
  },
};

/** Offline: the receipt history cannot be loaded; typed notes still work. */
export const OfflineReceiptHistory: Story = {
  decorators: [withReceiptsOffline],
};

/** Partial: a founder note target with no approve or reject handlers. */
export const PartialNoDecisionHandlers: Story = {
  args: {
    target: {
      type: 'founder-note' as const,
      id: 'brain-dump-1',
      title: 'Brain Dump',
      sourceKind: 'founder.brain_dump',
      category: 'suggestion',
    },
    onApprove: undefined,
    onReject: undefined,
  },
  decorators: [withRecorderWidth],
};

/** Long content: a card title far past one line. */
export const LongContentTargetTitle: Story = {
  args: {
    target: {
      type: 'inbox-card' as const,
      id: 'card-long',
      title:
        'Refresh the weak YouTube thumbnail for the remix stems lyric video and the pre-save page that still points at the old cover art',
      sourceKind: 'youtube.thumbnail_candidate',
      category: 'suggestion',
    },
  },
  decorators: [withRecorderWidth],
};

/** Right-to-left: an Arabic card title in an Arabic document. */
export const RtlArabicTargetTitle: Story = {
  args: {
    target: {
      type: 'inbox-card' as const,
      id: 'card-rtl',
      title: 'تحديث الصورة المصغرة الضعيفة',
      sourceKind: 'youtube.thumbnail_candidate',
      category: 'suggestion',
    },
  },
  decorators: [withRtlDocument],
};
