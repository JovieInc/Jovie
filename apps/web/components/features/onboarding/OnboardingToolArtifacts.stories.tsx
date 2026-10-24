import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { withOnboardingFixture } from '../../../.storybook/onboarding-fixtures';
import {
  OnboardingArtistConfirmedCard,
  OnboardingHandleCheckCard,
  OnboardingSocialLinkCard,
  OnboardingSpotifyArtistPickerCard,
} from './OnboardingToolArtifacts';

const meta = {
  title: 'Features/Onboarding/OnboardingToolArtifacts',
  component: OnboardingSpotifyArtistPickerCard,
  subcomponents: {
    OnboardingArtistConfirmedCard,
    OnboardingHandleCheckCard,
    OnboardingSocialLinkCard,
  },
  decorators: [withOnboardingFixture],
  parameters: {
    layout: 'padded',
    chromatic: { viewports: [390, 1280] },
    onboarding: {},
  },
  args: { onSelectArtist: fn(), onNoneOfThese: fn() },
} satisfies Meta<typeof OnboardingSpotifyArtistPickerCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Searching: Story = { args: { state: 'input-streaming' } };
export const SearchFailed: Story = { args: { state: 'output-error' } };
export const PickerEmpty: Story = {
  args: { state: 'output-available', output: { action: 'open_artist_picker' } },
};
export const PickerSelected: Story = {
  args: {
    state: 'output-available',
    output: { action: 'open_artist_picker', query: 'Story Artist' },
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const result = await canvas.findByRole('button', { name: /Story Artist/ });
    await userEvent.click(result);
    await expect(args.onSelectArtist).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'story-artist' })
    );
    await expect(canvas.queryByTestId('onboarding-artist-picker')).toBeNull();
  },
};
export const PickerResults: Story = { args: PickerSelected.args };
export const PickerDisabled: Story = {
  args: { ...PickerResults.args, disabled: true },
};
export const PickerNoResults: Story = {
  args: PickerResults.args,
  parameters: { onboarding: { search: 'empty' } },
};
export const PickerSearchError: Story = {
  args: PickerResults.args,
  parameters: { onboarding: { search: 'error' } },
};
export const PickerQueryLoading: Story = {
  args: PickerResults.args,
  parameters: { onboarding: { search: 'loading' } },
};
export const PickerNoneOfThese: Story = {
  args: { ...PickerResults.args, disabled: false, onNoneOfThese: fn() },
  play: async ({ args, canvasElement }) => {
    const button = await within(canvasElement).findByTestId(
      'onboarding-artist-none-of-these'
    );
    await expect(button).toBeEnabled();
    await userEvent.click(button);
    await waitFor(() => expect(args.onNoneOfThese).toHaveBeenCalledTimes(1));
    await button.focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(args.onNoneOfThese).toHaveBeenCalledTimes(2));
  },
};

export const ArtistLoading: Story = {
  render: () => <OnboardingArtistConfirmedCard state='input-streaming' />,
};
export const ArtistError: Story = {
  render: () => <OnboardingArtistConfirmedCard state='output-error' />,
};
export const ArtistConfirmed: Story = {
  render: () => (
    <OnboardingArtistConfirmedCard
      state='output-available'
      output={{
        action: 'spotify_artist_confirmed',
        artist: {
          id: 'story-artist',
          name: 'Story Artist',
          url: 'https://open.spotify.com/artist/story-artist',
        },
      }}
    />
  ),
};

export const HandleLoading: Story = {
  render: () => <OnboardingHandleCheckCard state='input-streaming' />,
};
export const HandleError: Story = {
  render: () => <OnboardingHandleCheckCard state='output-error' />,
};
export const HandleConfirmedLocally: Story = {
  render: () => (
    <OnboardingHandleCheckCard
      state='output-available'
      output={{ action: 'check_handle', handle: 'storyartist' }}
      onConfirmHandle={fn()}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const confirm = await canvas.findByTestId('onboarding-confirm-handle');
    await expect(confirm).toBeEnabled();
    await userEvent.click(confirm);
    await expect(
      canvas.getByRole('textbox', { name: 'Edit Proposed Handle' })
    ).toBeDisabled();
  },
};
export const HandleAvailable: Story = { render: HandleConfirmedLocally.render };
export const HandleTaken: Story = {
  render: HandleAvailable.render,
  parameters: { onboarding: { handle: 'taken' } },
};
export const HandleUnavailable: Story = {
  render: HandleAvailable.render,
  parameters: { onboarding: { handle: 'error' } },
};
export const HandleDisabled: Story = {
  render: () => (
    <OnboardingHandleCheckCard
      state='output-available'
      output={{ action: 'check_handle', handle: 'storyartist' }}
      disabled
      onConfirmHandle={fn()}
    />
  ),
};
export const HandleConfirmed: Story = {
  render: () => (
    <OnboardingHandleCheckCard
      state='output-available'
      output={{ action: 'handle_confirmed', handle: 'storyartist' }}
    />
  ),
};

export const SocialLoading: Story = {
  render: () => <OnboardingSocialLinkCard state='input-streaming' />,
};
export const SocialError: Story = {
  render: () => <OnboardingSocialLinkCard state='output-error' />,
};
export const SocialEmpty: Story = {
  render: () => (
    <OnboardingSocialLinkCard
      state='output-available'
      output={{ action: 'propose_social_link' }}
      onAttachAccount={fn()}
    />
  ),
};
export const SocialAttachedLocally: Story = {
  render: () => (
    <OnboardingSocialLinkCard
      state='output-available'
      output={{
        action: 'propose_social_link',
        url: 'https://instagram.com/storyartist',
      }}
      onAttachAccount={fn()}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByTestId('onboarding-attach-account')
    );
    await expect(canvas.getByRole('textbox')).toBeDisabled();
  },
};
export const SocialValid: Story = { render: SocialAttachedLocally.render };
export const SocialInvalid: Story = {
  render: () => (
    <OnboardingSocialLinkCard
      state='output-available'
      output={{ action: 'propose_social_link', url: 'https://instagram.com/' }}
      onAttachAccount={fn()}
    />
  ),
};
export const SocialDisabled: Story = {
  render: () => (
    <OnboardingSocialLinkCard
      state='output-available'
      output={{
        action: 'propose_social_link',
        url: 'https://instagram.com/storyartist',
      }}
      disabled
      onAttachAccount={fn()}
    />
  ),
};
export const SocialAttached: Story = {
  render: () => (
    <OnboardingSocialLinkCard
      state='output-available'
      output={{
        action: 'social_attached',
        url: 'https://instagram.com/storyartist',
      }}
    />
  ),
};
