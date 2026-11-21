import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { IngestedSuggestions, type SuggestedLink } from './IngestedSuggestions';

function suggestion(id: string, name: string, url: string): SuggestedLink {
  return {
    suggestionId: id,
    platform: {
      id,
      name,
      category: 'social',
      icon: id,
      color: '#888888',
      placeholder: '',
    },
    normalizedUrl: url,
    originalUrl: url,
    suggestedTitle: name,
    isValid: true,
    confidence: 0.8,
    sourcePlatform: 'linktree',
    sourceType: 'linktree',
  };
}

const meta = {
  title: 'Features/Dashboard/Organisms/Links/IngestedSuggestions/States',
  component: IngestedSuggestions,
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
  args: { onAccept: fn(), onDismiss: fn() },
} satisfies Meta<typeof IngestedSuggestions>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no suggestions, so nothing renders. */
export const Empty: Story = { args: { suggestions: [] } };

/** Partial: a single suggestion. */
export const Partial: Story = {
  args: {
    suggestions: [
      suggestion('instagram', 'Instagram', 'https://instagram.com/novalane'),
    ],
  },
};

/** Long content: many suggestions with long handles that wrap. */
export const LongContent: Story = {
  args: {
    suggestions: [
      suggestion(
        'instagram',
        'Instagram',
        'https://instagram.com/the_extraordinarily_long_username_of_a_busy_artist'
      ),
      suggestion('tiktok', 'TikTok', 'https://tiktok.com/@novalane'),
      suggestion('youtube', 'YouTube', 'https://youtube.com/@novalane'),
      suggestion('spotify', 'Spotify', 'https://open.spotify.com/artist/abc'),
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
  args: {
    suggestions: [
      suggestion('instagram', 'Instagram', 'https://instagram.com/novalane'),
    ],
  },
};
