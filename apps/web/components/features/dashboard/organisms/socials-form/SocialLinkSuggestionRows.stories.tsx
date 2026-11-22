import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SocialLinkSuggestionRows } from './SocialLinkSuggestionRows';

const meta = {
  title: 'Dashboard/Organisms/SocialsForm/SocialLinkSuggestionRows',
  component: SocialLinkSuggestionRows,
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof SocialLinkSuggestionRows>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    suggestions: [
      {
        id: 's1',
        platform: 'instagram',
        platformLabel: 'Instagram',
        url: 'https://instagram.com/demo',
        username: 'demo',
        confidence: 0.9,
      },
    ],
    actioningId: null,
    onConfirm: () => {},
    onDismiss: () => {},
  },
};

const LONG_SUGGESTION = {
  id: 's2',
  platform: 'instagram',
  platformLabel: 'Instagram for an extremely long label that must truncate',
  url: 'https://instagram.com/an-extremely-long-handle-that-keeps-going-and-going',
  username: 'an-extremely-long-handle-that-keeps-going-and-going',
  confidence: 0.9,
};

export const Empty: Story = {
  args: { ...Default.args, suggestions: [] },
};

export const Partial: Story = {
  args: {
    ...Default.args,
    suggestions: [
      ...(Default.args?.suggestions ?? []),
      { ...LONG_SUGGESTION, id: 's3', username: null },
    ],
    actioningId: 's1',
  },
};

export const LongContent: Story = {
  args: { ...Default.args, suggestions: [LONG_SUGGESTION] },
};

export const Rtl: Story = {
  args: { ...Default.args, suggestions: [LONG_SUGGESTION] },
  decorators: [
    function RtlDecorator(StoryFn) {
      return (
        <div dir='rtl'>
          <StoryFn />
        </div>
      );
    },
  ],
};
