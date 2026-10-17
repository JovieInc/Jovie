import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { withOnboardingFixture } from './onboarding-fixtures';

const notifySession = vi.hoisted(() => vi.fn());

vi.mock('../hooks/useJovieAuth', () => ({
  JovieAuthValuesProvider: ({ children }: Readonly<{ children: ReactNode }>) =>
    children,
}));

vi.mock('../lib/auth/client', () => ({
  authClient: {
    $store: {
      notify: notifySession,
    },
  },
}));

type FixtureOptions = {
  readonly authUi?: boolean;
  readonly signedIn?: boolean;
  readonly search?: 'empty' | 'error' | 'loading';
  readonly handle?: 'taken' | 'error';
};

type ApiMock = (request: {
  url: URL;
  init?: RequestInit;
}) => Response | Promise<Response> | undefined;

type MockWindow = Window & { __jovieApiMock?: ApiMock };

function StoryChild() {
  return <p>Story child</p>;
}

function renderFixture(onboarding?: FixtureOptions) {
  return render(
    withOnboardingFixture(StoryChild, {
      parameters: onboarding === undefined ? {} : { onboarding },
    } as Parameters<typeof withOnboardingFixture>[1])
  );
}

async function installedMock(): Promise<ApiMock> {
  await screen.findByText('Story child');
  const mock = (window as MockWindow).__jovieApiMock;
  if (!mock) throw new Error('onboarding fixture did not install an API mock');
  return mock;
}

async function callApi(pathname: string): Promise<Response> {
  const mock = await installedMock();
  const result = await mock({ url: new URL(pathname, 'http://localhost') });
  if (!(result instanceof Response)) {
    throw new Error(`expected a Response for ${pathname}`);
  }
  return result;
}

describe('onboarding storybook fixture', () => {
  afterEach(() => {
    cleanup();
    delete (window as MockWindow).__jovieApiMock;
    vi.clearAllMocks();
  });

  it('answers artist search, an open handle, and blocks other API writes', async () => {
    const previous = vi.fn(() => Response.json({ ok: true }));
    (window as MockWindow).__jovieApiMock = previous;
    const view = renderFixture();

    expect(await (await callApi('/api/auth/get-session')).json()).toBeNull();
    expect(await (await callApi('/api/spotify/search')).json()).toEqual([
      {
        id: 'story-artist',
        name: 'Story Artist',
        url: 'https://open.spotify.com/artist/story-artist',
        imageUrl: null,
        followers: 1200,
        popularity: 30,
        genres: [],
      },
    ]);
    expect(await (await callApi('/api/handle/check')).json()).toEqual({
      available: true,
      suggestedAlternatives: [],
    });
    const blocked = await callApi('/api/profile');
    expect(blocked.status).toBe(503);
    expect(await blocked.json()).toEqual({
      error: 'Unavailable in this fixture',
    });
    expect(await (await callApi('/images/cover.jpg')).json()).toEqual({
      ok: true,
    });
    expect(previous).toHaveBeenCalledOnce();

    view.unmount();
    expect((window as MockWindow).__jovieApiMock).toBe(previous);
  });

  it('returns an empty search and a taken handle', async () => {
    renderFixture({ search: 'empty', handle: 'taken' });

    expect(await (await callApi('/api/spotify/search')).json()).toEqual([]);
    expect(await (await callApi('/api/handle/check')).json()).toEqual({
      available: false,
      suggestedAlternatives: ['storyartistmusic'],
    });
  });

  it('returns search and handle failures', async () => {
    renderFixture({ search: 'error', handle: 'error' });

    const search = await callApi('/api/spotify/search');
    expect(search.status).toBe(503);
    expect(await search.json()).toEqual({ error: 'Search unavailable' });
    expect(await (await callApi('/api/handle/check')).json()).toEqual({
      available: false,
      error: 'Check unavailable',
    });
  });

  it('keeps a loading search pending', async () => {
    renderFixture({ search: 'loading' });
    const mock = await installedMock();
    const pending = mock({
      url: new URL('/api/spotify/search', 'http://localhost'),
    });
    expect(pending).toBeInstanceOf(Promise);
    const winner = await Promise.race([
      Promise.resolve(pending).then(() => 'settled'),
      Promise.resolve('pending'),
    ]);
    expect(winner).toBe('pending');
  });

  it('returns the signed-in session when the story asks for one', async () => {
    renderFixture({ signedIn: true });
    const session = await (await callApi('/api/auth/get-session')).json();
    expect(session).toMatchObject({
      user: { id: 'story-user', email: 'tim@example.com' },
      session: { userId: 'story-user' },
    });
  });

  it('mounts the auth provider when the story needs signed-in UI', async () => {
    renderFixture({ authUi: true });
    expect(await screen.findByText('Story child')).toBeTruthy();
    expect(notifySession).toHaveBeenCalledWith('$sessionSignal');
  });
});
