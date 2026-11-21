import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { SocialLinkSuggestionRows } from './SocialLinkSuggestionRows';

const suggestions = [
  {
    id: 's1',
    platform: 'instagram',
    platformLabel: 'Instagram',
    url: 'https://instagram.com/novalane',
    username: 'novalane',
    confidence: 0.9,
  },
  {
    id: 's2',
    platform: 'tiktok',
    platformLabel: 'TikTok',
    url: 'https://tiktok.com/@novalane',
    username: null,
    confidence: null,
  },
];

const meta = {
  title: 'Dashboard/Organisms/SocialsForm/SocialLinkSuggestionRows',
  component: SocialLinkSuggestionRows,
  parameters: { layout: 'centered' },
  decorators: [
    function WidthDecorator(Story) {
      return (
        <div className='w-full max-w-md'>
          <Story />
        </div>
      );
    },
  ],
  args: {
    suggestions,
    actioningId: null,
    onConfirm: fn(),
    onDismiss: fn(),
  },
} satisfies Meta<typeof SocialLinkSuggestionRows>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Empty: nothing detected, so the component renders nothing. */
export const Empty: Story = { args: { suggestions: [] } };

/** Loading: the first suggestion is being added. */
export const Loading: Story = { args: { actioningId: 's1' } };

/** Long content: a username and URL that overflow the row. */
export const LongContent: Story = {
  args: {
    suggestions: [
      {
        ...suggestions[0],
        platformLabel: 'Instagram for an extraordinarily long profile name',
        username: 'the_extraordinarily_long_username_of_a_very_busy_artist',
      },
    ],
  },
};

/** Rtl: right-to-left layout. */
export const Rtl: Story = {
  decorators: [
    function RtlDecorator(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
