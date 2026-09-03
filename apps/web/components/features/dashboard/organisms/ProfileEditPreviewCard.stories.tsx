import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  type ProfileEditPreview,
  ProfileEditPreviewCard,
} from './ProfileEditPreviewCard';

const profileId = 'storybook-profile';

const displayNamePreview: ProfileEditPreview = {
  field: 'displayName',
  fieldLabel: 'Display name',
  currentValue: 'Old Name',
  newValue: 'New Name',
  reason: 'Better branding',
};

const meta = {
  title: 'Dashboard/Organisms/ProfileEditPreviewCard',
  component: ProfileEditPreviewCard,
  parameters: {
    layout: 'centered',
  },
  args: {
    profileId,
    preview: displayNamePreview,
  },
} satisfies Meta<typeof ProfileEditPreviewCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithSourceProvenance: Story = {
  args: {
    preview: {
      field: 'bio',
      fieldLabel: 'Artist bio/description',
      currentValue: 'Old bio',
      newValue: 'New bio about the artist',
      reason: 'Imported from a public source',
      sourceUrl: 'https://example.com/artist',
      sourceTitle: 'Example artist page',
    },
  },
};

export const UnsetCurrentValue: Story = {
  args: {
    preview: {
      field: 'genres',
      fieldLabel: 'Genres',
      currentValue: null,
      newValue: ['Indie', 'Alternative'],
    },
  },
};
