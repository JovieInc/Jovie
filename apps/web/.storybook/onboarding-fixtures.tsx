import type { Decorator } from '@storybook/nextjs-vite';
import { type ReactNode, useEffect, useLayoutEffect, useState } from 'react';
import { JovieAuthValuesProvider } from '../hooks/useJovieAuth';
import { authClient } from '../lib/auth/client';
import { createSignedInApiMock } from './signed-in-session';

interface FixtureOptions {
  readonly authUi?: boolean;
  readonly signedIn?: boolean;
  readonly search?: 'empty' | 'error' | 'loading';
  readonly handle?: 'taken' | 'error';
}

type FixtureWindow = Window & {
  __jovieApiMock?: (request: {
    url: URL;
    init?: RequestInit;
  }) => Response | Promise<Response> | undefined;
};

function AuthFixture({ children }: Readonly<{ children: ReactNode }>) {
  useEffect(() => {
    authClient.$store.notify('$sessionSignal');
  }, []);
  return <JovieAuthValuesProvider>{children}</JovieAuthValuesProvider>;
}

function OnboardingFixture({
  children,
  options,
}: Readonly<{ children: ReactNode; options: FixtureOptions }>) {
  const [ready, setReady] = useState(false);
  useLayoutEffect(() => {
    const target = window as FixtureWindow;
    const previous = target.__jovieApiMock;
    const signedIn = createSignedInApiMock();
    target.__jovieApiMock = request => {
      const { pathname } = request.url;
      if (pathname === '/api/auth/get-session')
        return options.signedIn ? signedIn(request) : Response.json(null);
      if (pathname === '/api/spotify/search') {
        if (options.search === 'loading')
          return new Promise<Response>(() => {});
        if (options.search === 'error')
          return Response.json(
            { error: 'Search unavailable' },
            { status: 503 }
          );
        return Response.json(
          options.search === 'empty'
            ? []
            : [
                {
                  id: 'story-artist',
                  name: 'Story Artist',
                  url: 'https://open.spotify.com/artist/story-artist',
                  imageUrl: null,
                  followers: 1200,
                  popularity: 30,
                  genres: [],
                },
              ]
        );
      }
      if (pathname === '/api/handle/check')
        return Response.json(
          options.handle === 'error'
            ? { available: false, error: 'Check unavailable' }
            : {
                available: options.handle !== 'taken',
                suggestedAlternatives:
                  options.handle === 'taken' ? ['storyartistmusic'] : [],
              }
        );
      // No live email, model, profile or payment writes from these stories.
      if (pathname.startsWith('/api/'))
        return Response.json(
          { error: 'Unavailable in this fixture' },
          { status: 503 }
        );
      return previous?.(request);
    };
    setReady(true);
    return () => {
      target.__jovieApiMock = previous;
    };
  }, [options]);
  return (
    <div className='w-full max-w-110'>
      {ready ? (
        options.authUi ? (
          <AuthFixture>{children}</AuthFixture>
        ) : (
          children
        )
      ) : null}
    </div>
  );
}

export const withOnboardingFixture: Decorator = (Story, context) => (
  <OnboardingFixture options={context.parameters.onboarding ?? {}}>
    <Story />
  </OnboardingFixture>
);
