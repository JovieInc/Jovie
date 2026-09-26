import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { SuggestedPrompts } from './SuggestedPrompts';

const meta = {
  title: 'Jovie/SuggestedPrompts',
  component: SuggestedPrompts,
  args: {
    onSelect: fn(),
  },
  parameters: {
    // `disabled` belongs to the private SuggestionPill helper, not to
    // SuggestedPrompts' own props; the AlbumArtUnavailable story below
    // exercises the disabled pill through `albumArtCapability` instead.
    jovie: {
      uncoveredProps: ['disabled'],
    },
  },
} satisfies Meta<typeof SuggestedPrompts>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Rail: Story = {};

export const Grid: Story = {
  args: {
    layout: 'grid',
  },
};

export const FirstSession: Story = {
  args: {
    isFirstSession: true,
  },
};

export const AlbumArtUnavailable: Story = {
  args: {
    albumArtCapability: {
      availability: 'unavailable',
      reason: 'Album art needs a Pro plan.',
      reasonCode: 'PLAN_UNAVAILABLE',
    },
  },
};
