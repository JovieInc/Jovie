import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Paperclip } from 'lucide-react';
import { fn } from 'storybook/test';
import { SlashCommandMenu } from './SlashCommandMenu';

const meta = {
  title: 'Jovie/Components/SlashCommandMenu',
  component: SlashCommandMenu,
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
