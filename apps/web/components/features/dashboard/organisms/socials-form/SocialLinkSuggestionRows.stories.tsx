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
