import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { OpportunityInboxCard } from './OpportunityInboxCard';

const meta: Meta<typeof OpportunityInboxCard> = {
  title: 'Features/OpportunityInbox/OpportunityInboxCard',
  component: OpportunityInboxCard,
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof OpportunityInboxCard>;

export const SuggestionCard: Story = {
  args: {
    card: {
      id: 'story-card-1',
      signalType: 'other',
      typeLabel: 'Suggestion',
      createdAt: '2026-06-28T10:00:00.000Z',
      title: 'Detroit listeners up 340% — book a show',
      why: 'A promoter at the Magic Stick reached out yesterday. Jovie tied it to your Spotify growth there.',
      primaryActionLabel: 'Review pitch',
      status: 'pending',
      category: 'suggestion',
    },
    onApprove: () => undefined,
    onDismiss: () => undefined,
    onFeedback: () => undefined,
    className: 'w-[42rem] max-w-full',
  },
};

export const NewSongCard: Story = {
  args: {
    card: {
      id: 'story-card-2',
      signalType: 'new_song',
      typeLabel: 'New Song',
      createdAt: '2026-06-28T10:00:00.000Z',
      title: 'New single detected on Spotify',
      why: 'Jovie spotted a fresh release on your catalog and can spin up smart links.',
      primaryActionLabel: 'Set up release',
      status: 'pending',
    },
    onApprove: () => undefined,
    onDismiss: () => undefined,
    onFeedback: () => undefined,
    className: 'w-[42rem] max-w-full',
  },
};

export const NewEventCard: Story = {
  args: {
    card: {
      id: 'story-card-3',
      signalType: 'new_event',
      typeLabel: 'New Event',
      createdAt: '2026-06-28T10:00:00.000Z',
      title: 'Detroit listeners up 340% — book a show',
      why: 'A promoter at the Magic Stick reached out yesterday.',
      primaryActionLabel: 'Add to calendar',
      status: 'pending',
    },
    onApprove: () => undefined,
    onDismiss: () => undefined,
    onFeedback: () => undefined,
    className: 'w-[42rem] max-w-full',
  },
};

export const ProfileMatchCard: Story = {
  args: {
    card: {
      id: 'story-card-4',
      signalType: 'new_profile_match',
      typeLabel: 'Profile Match',
      createdAt: '2026-06-28T10:00:00.000Z',
      title: 'Similar artist match found',
      why: 'Jovie matched a similar artist whose audience overlaps yours in the midwest.',
      primaryActionLabel: 'Review match',
      status: 'pending',
    },
    onApprove: () => undefined,
    onDismiss: () => undefined,
    onFeedback: () => undefined,
    className: 'w-[42rem] max-w-full',
  },
};
