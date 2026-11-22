import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Paperclip } from 'lucide-react';
import { fn } from 'storybook/test';
import { PickerRow } from './picker-rows';

const action = {
  id: 'attach-files',
  label: 'Attach files',
  description: 'Drop or browse',
  icon: Paperclip,
  onSelect: fn(),
};

const meta = {
  title: 'Jovie/Components/PickerRows/States',
  component: PickerRow,
  parameters: { layout: 'centered', backgrounds: { default: 'dark' } },
  decorators: [
    function ListboxFrame(Story) {
      return (
        <div role='listbox' aria-label='Attachments' className='w-72'>
          <Story />
        </div>
      );
    },
  ],
  args: {
    item: { kind: 'action', action },
    index: 0,
    isActive: false,
    onMouseEnter: fn(),
    onCommit: fn(),
  },
} satisfies Meta<typeof PickerRow>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Partial: an idle row with a prompt item and no highlight. */
export const PartialIdlePrompt: Story = {
  args: {
    item: {
      kind: 'prompt',
      prompt: {
        id: 'p1',
        label: 'Plan a release',
        description: 'Draft a rollout',
        prompt: 'Plan my next release',
      },
    },
  },
};

/** Long content: a long label and description truncate inside the row. */
export const LongContentTruncated: Story = {
  args: {
    isActive: true,
    item: {
      kind: 'action',
      action: {
        ...action,
        label:
          'Attach every file from the release folder including stems, artwork and press photos',
        description:
          'Drop files here or browse your computer to add them to this conversation',
      },
    },
  },
};

/** Rtl: the artwork and copy mirror in a right-to-left list. */
export const RtlRow: Story = {
  args: {
    item: {
      kind: 'action',
      action: { ...action, label: 'إرفاق ملفات', description: 'اسحب أو تصفح' },
    },
  },
  decorators: [
    function RtlFrame(Story) {
      return (
        <div dir='rtl' role='listbox' aria-label='مرفقات' className='w-72'>
          <Story />
        </div>
      );
    },
  ],
};
