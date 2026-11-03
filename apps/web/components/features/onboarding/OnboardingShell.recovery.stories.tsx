import { Button } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useEffect, useState } from 'react';
import { OnboardingIdentityConflict, OnboardingShell } from './OnboardingShell';

const artist = {
  id: '1ZlSI1juLMMN1HU8X7RViN',
  name: 'UNMARKED',
  url: 'https://open.spotify.com/artist/1ZlSI1juLMMN1HU8X7RViN',
  imageUrl: null,
  followers: 100,
  popularity: 1,
  genres: [],
};
// Component-only deterministic SSE fixture. The real-auth Golden Path remains the acceptance gate.
function RecoveryFixture() {
  const [turns, setTurns] = useState(0);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const originalFetch = globalThis.fetch;
    const previousE2eMode = document.documentElement.dataset.e2eMode;
    document.documentElement.dataset.e2eMode = '1';
    let count = 0;
    globalThis.fetch = async (input, init) => {
      if (String(input) !== '/api/chat') return originalFetch(input, init);
      count += 1;
      setTurns(count);
      const first = count === 1;
      const id = `turn-${count}`;
      const chunks = [
        { type: 'start', messageId: id },
        { type: 'start-step' },
        { type: 'text-start', id },
        {
          type: 'text-delta',
          id,
          delta: first
            ? 'Found UNMARKED on Spotify: 100 followers. Confirm the handle for this page below.'
            : 'Checking your profile handle.',
        },
        { type: 'text-end', id },
        {
          type: 'tool-input-available',
          toolCallId: id,
          toolName: first ? 'confirmSpotifyArtist' : 'checkHandle',
          input: first
            ? { spotifyArtistId: artist.id }
            : { handle: 'unmarked' },
        },
        {
          type: 'tool-output-available',
          toolCallId: id,
          output: first
            ? {
                action: 'spotify_artist_confirmed',
                spotifyArtistId: artist.id,
                artist,
                metrics: null,
                summary: 'UNMARKED confirmed',
              }
            : {
                action: 'check_handle',
                handle: 'unmarked',
                summary: 'Checking @unmarked.',
              },
        },
        // JOV-10168: the confirm-artist turn ships the checkHandle card in
        // the same turn as the confirm output (the route's
        // turnFromArtistConfirmation event order), so the preview artist has
        // a real handle and the rail renders — never the fabricated
        // jov.ie/your-handle placeholder (JOV-10169).
        ...(first
          ? [
              {
                type: 'tool-input-available',
                toolCallId: `${id}-handle`,
                toolName: 'checkHandle',
                input: { handle: 'unmarked' },
              },
              {
                type: 'tool-output-available',
                toolCallId: `${id}-handle`,
                output: {
                  action: 'check_handle',
                  handle: 'unmarked',
                  summary: 'Checking @unmarked.',
                },
              },
            ]
          : []),
        { type: 'finish-step' },
        { type: 'finish', finishReason: 'stop' },
      ];
      return new Response(
        chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join('') +
          'data: [DONE]\n\n',
        {
          headers: {
            'content-type': 'text/event-stream',
            'x-vercel-ai-ui-message-stream': 'v1',
            'x-onboarding-fallback': first ? 'confirm_artist:v3' : 'handle:v3',
          },
        }
      );
    };
    setReady(true);
    return () => {
      globalThis.fetch = originalFetch;
      if (previousE2eMode === undefined) {
        delete document.documentElement.dataset.e2eMode;
      } else {
        document.documentElement.dataset.e2eMode = previousE2eMode;
      }
    };
  }, []);
  return (
    <div className='h-dvh'>
      <output data-testid='submitted-turn-count' className='sr-only'>
        {turns}
      </output>
      {ready ? <OnboardingShell sessionLabel='anonymous' /> : null}
    </div>
  );
}
const meta = {
  title: 'Features/Onboarding/ChatRecovery',
  component: RecoveryFixture,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof RecoveryFixture>;
export default meta;
type Story = StoryObj<typeof meta>;
export const SecondTurn: Story = {};

// The real recovery component in the shell's normal-flow interaction boundary.
// This fixture has no account, backend, provider, or customer mutation.
function IdentityConflictFixture() {
  const [visible, setVisible] = useState(false);
  const [switches, setSwitches] = useState(0);
  return (
    <div className='flex h-dvh min-h-0 flex-col bg-surface-0 text-primary-token'>
      <OnboardingIdentityConflict
        visible={visible}
        isSignedIn
        onLogout={() => setSwitches(value => value + 1)}
      >
        <Button
          variant='ghost'
          size='sm'
          onClick={() => setVisible(value => !value)}
        >
          Toggle Conflict
        </Button>
        <Button
          variant='ghost'
          size='sm'
          onClick={() => setSwitches(value => value + 1)}
        >
          Log Out
        </Button>
      </OnboardingIdentityConflict>
      <div
        className='flex min-h-0 flex-1 flex-col px-3'
        data-testid='recovery-transcript'
      >
        <p>Progressive house, mostly. I want a profile that converts fans.</p>
        <div className='mt-auto py-3'>
          <label htmlFor='recovery-message'>Chat message</label>
          <input
            id='recovery-message'
            className='focus-ring-themed block w-full rounded-md border border-subtle bg-surface-1 p-2'
          />
        </div>
      </div>
      <output className='sr-only' data-testid='recovery-switch-count'>
        {switches}
      </output>
    </div>
  );
}
export const IdentityConflict: Story = {
  render: () => <IdentityConflictFixture />,
};
