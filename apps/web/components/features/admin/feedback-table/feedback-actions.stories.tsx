import { CommonDropdown } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import {
  buildFeedbackActions,
  type FeedbackActionTarget,
  feedbackActionsToDropdownItems,
} from './feedback-actions';

interface FeedbackActionsPreviewProps {
  readonly item: FeedbackActionTarget;
  readonly dismissPending: boolean;
  readonly dir?: 'ltr' | 'rtl';
  readonly onCopyAsMarkdown: (item: FeedbackActionTarget) => void;
  readonly onDismiss: (item: FeedbackActionTarget) => void;
}

/**
 * The canonical feedback action registry rendered the way the detail rail
 * and row overflow show it: one dropdown, held open for review.
 */
function FeedbackActionsPreview({
  item,
  dismissPending,
  dir,
  onCopyAsMarkdown,
  onDismiss,
}: FeedbackActionsPreviewProps) {
  const items = feedbackActionsToDropdownItems(
    buildFeedbackActions(item, {
      onCopyAsMarkdown,
      onDismiss,
      isDismissPending: () => dismissPending,
    })
  );
  return (
    <CommonDropdown
      variant='dropdown'
      size='compact'
      items={items}
      open
      modal={false}
      dir={dir}
      aria-label='Feedback Actions'
    />
  );
}

const meta = {
  title: 'Features/Admin/FeedbackActions',
  component: FeedbackActionsPreview,
  parameters: { layout: 'centered' },
  args: {
    item: { id: 'fb_1', status: 'pending' },
    dismissPending: false,
    onCopyAsMarkdown: fn(),
    onDismiss: fn(),
  },
} satisfies Meta<typeof FeedbackActionsPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Pending feedback: copy and dismiss are both available. */
export const Default: Story = {};

/** Already dismissed: Dismiss stays visible but disabled. */
export const Dismissed: Story = {
  args: { item: { id: 'fb_3', status: 'dismissed' } },
};

/** Loading: a dismiss request is in flight, so Dismiss is disabled. */
export const LoadingDismissPending: Story = {
  args: { dismissPending: true },
};

/** Right-to-left: the menu inside an RTL document. */
export const RtlDocument: Story = {
  args: { dir: 'rtl' },
  decorators: [
    function RtlDocumentDecorator(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
