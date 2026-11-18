import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Paperclip } from 'lucide-react';
import { fn } from 'storybook/test';
import { SlashCommandMenu } from './SlashCommandMenu';

const meta = {
  title: 'Jovie/Components/SlashCommandMenu',
  component: SlashCommandMenu,
  decorators: [
    Story => (
      <div className='system-b-chat-composer-picker-shell isolate w-140 overflow-hidden'>
        <Story />
      </div>
    ),
  ],
  parameters: {
    layout: 'centered',
    backgrounds: { default: 'dark' },
    jovie: {
      uncoveredProps: [
        'variant',
        'listIdProp',
        'onActiveRowChange',
        'promptActions',
        'onSelectPrompt',
        'loading',
        'isLoading',
      ],
    },
  },
  args: {
    state: { status: 'root', query: '', startIdx: 0, selectedIndex: 0 },
    profileId: 'profile-story',
    onSelectSkill: fn(),
    onSelectEntity: fn(),
    onSetSelected: fn(),
    onMoveSelected: fn(),
    onClose: fn(),
    attachmentActions: [
      {
        kind: 'action',
        action: {
          id: 'attach-files',
          label: 'Attach Files',
          description: 'Drop or browse',
          icon: Paperclip,
          onSelect: fn(),
        },
      },
    ],
    onQueryChange: fn(),
  },
} satisfies Meta<typeof SlashCommandMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PlusPalette: Story = {};

// A filter that matches no command, file or reference.
export const EmptyNoMatches: Story = {
  args: {
    state: { status: 'root', query: 'zzzz', startIdx: 0, selectedIndex: 0 },
  },
};

// The slash menu as the composer opens it: no attachment rows and no filter
// field, so the header names the mode instead.
export const PartialNoAttachments: Story = {
  args: {
    attachmentActions: undefined,
    onQueryChange: undefined,
  },
};

export const LongContent: Story = {
  args: {
    attachmentActions: [
      {
        kind: 'action',
        action: {
          id: 'attach-files',
          label:
            'Attach Stems, Session Files, Cover Art And Every Alternate Master For The Deluxe Edition',
          description:
            'Drop or browse for audio, artwork, lyric sheets, split sheets and anything else this release needs before it ships',
          icon: Paperclip,
          onSelect: fn(),
        },
      },
    ],
  },
};

export const Rtl: Story = {
  args: {
    attachmentActions: [
      {
        kind: 'action',
        action: {
          id: 'attach-files',
          label: 'إرفاق ملفات',
          description: 'اسحب الملفات أو تصفّح',
          icon: Paperclip,
          onSelect: fn(),
        },
      },
    ],
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
