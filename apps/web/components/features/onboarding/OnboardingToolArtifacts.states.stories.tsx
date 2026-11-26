import '../../../styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import {
  OnboardingArtistConfirmedCard,
  OnboardingHandleCheckCard,
  OnboardingSocialLinkCard,
  OnboardingSpotifyArtistPickerCard,
} from './OnboardingToolArtifacts';

type ApiMock = (request: { url: URL }) => Response | undefined;

function mockHandleApi(respond: () => Response) {
  (window as Window & { __jovieApiMock?: ApiMock }).__jovieApiMock = ({
    url,
  }) => (url.pathname === '/api/handle/check' ? respond() : undefined);
}

function Frame({
  children,
  dir,
}: {
  readonly children: ReactNode;
  readonly dir?: 'rtl';
}) {
  return (
    <div style={{ width: 640, padding: 24 }} dir={dir}>
      {children}
    </div>
  );
}

const meta = {
  title: 'Features/Onboarding/OnboardingToolArtifacts/States',
  component: OnboardingSpotifyArtistPickerCard,
  parameters: {
    layout: 'centered',
    jovie: { uncoveredProps: ['disabled'] },
  },
  args: { onSelectArtist: () => {} },
} satisfies Meta<typeof OnboardingSpotifyArtistPickerCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: the agent is still looking for the Spotify artist. */
export const LoadingArtistSearch: Story = {
  args: { state: 'input-streaming', inputQuery: 'Alex Example' },
};

/** Loading: the handle check is in flight. */
export const LoadingHandleCheck: Story = {
  render: () => (
    <Frame>
      <OnboardingHandleCheckCard
        state='input-available'
        output={{ action: 'check_handle', handle: 'alexexample' }}
      />
    </Frame>
  ),
};

/** Empty: no query yet, so the picker explains where to start. */
export const EmptyPickerNoQuery: Story = {
  args: {
    state: 'output-available',
    output: { action: 'open_artist_picker', query: null },
  },
};

/** Error: the Spotify search tool failed and chat takes over. */
export const ErrorArtistSearch: Story = {
  args: { state: 'output-error' },
};

/** Error: the handle check failed. */
export const ErrorHandleCheck: Story = {
  render: () => (
    <Frame>
      <OnboardingHandleCheckCard state='output-error' />
    </Frame>
  ),
};

/** Offline: the availability request fails and the handle stays unconfirmed. */
export const OfflineHandleCheck: Story = {
  render: () => {
    mockHandleApi(() =>
      Response.json({ error: 'You appear to be offline.' }, { status: 503 })
    );
    return (
      <Frame>
        <OnboardingHandleCheckCard
          state='output-available'
          output={{ action: 'check_handle', handle: 'alexexample' }}
          onConfirmHandle={() => {}}
        />
      </Frame>
    );
  },
};

/** Partial: the pasted link has no account path yet, so a hint shows. */
export const PartialSocialLinkMissingPath: Story = {
  render: () => (
    <Frame>
      <OnboardingSocialLinkCard
        state='output-available'
        output={{ action: 'propose_social_link', url: 'https://instagram.com' }}
        onAttachAccount={() => {}}
      />
    </Frame>
  ),
};

/** Long content: a very long handle wraps inside the status line. */
export const LongContentHandle: Story = {
  render: () => {
    mockHandleApi(() => Response.json({ available: true }));
    return (
      <Frame>
        <OnboardingHandleCheckCard
          state='output-available'
          output={{
            action: 'check_handle',
            handle: 'an.unusually.long.artist.handle.with.many.parts',
          }}
          onConfirmHandle={() => {}}
        />
      </Frame>
    );
  },
};

/** Permission denied: the Spotify profile lookup was refused. */
export const PermissionDeniedArtistProfile: Story = {
  render: () => (
    <Frame>
      <OnboardingArtistConfirmedCard state='output-denied' />
    </Frame>
  ),
};

/** Right to left: the social link field under an Arabic document direction. */
export const RtlSocialLink: Story = {
  render: () => (
    <Frame dir='rtl'>
      <OnboardingSocialLinkCard
        state='output-available'
        output={{
          action: 'propose_social_link',
          url: 'https://instagram.com/alexexample',
        }}
        onAttachAccount={() => {}}
      />
    </Frame>
  ),
};
