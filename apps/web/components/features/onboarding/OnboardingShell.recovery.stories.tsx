import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useEffect, useState } from 'react';
import { OnboardingShell } from './OnboardingShell';

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
            ? 'UNMARKED is confirmed. Choose your profile handle.'
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
