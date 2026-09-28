import { render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createSignedInApiMock,
  withSignedInSession,
} from '@/.storybook/signed-in-session';

type ApiMockWindow = Window & {
  __jovieApiMock?: (request: {
    url: URL;
    init?: RequestInit;
  }) => Response | Promise<Response> | undefined;
};

const apiMockWindow = window as ApiMockWindow;

function renderDecorator(story: () => React.ReactElement) {
  return render(<>{withSignedInSession(story, {} as never)}</>);
}

describe('withSignedInSession', () => {
  afterEach(() => {
    apiMockWindow.__jovieApiMock = undefined;
    vi.restoreAllMocks();
  });

  it('registers __jovieApiMock before the story mounts and restores on unmount', () => {
    let mockDuringMount: ApiMockWindow['__jovieApiMock'];

    const { unmount } = renderDecorator(() => {
      mockDuringMount = apiMockWindow.__jovieApiMock;
      return <div data-testid='story' />;
    });

    expect(screen.getByTestId('story')).toBeTruthy();
    expect(mockDuringMount).toBeTypeOf('function');

    unmount();
    expect(apiMockWindow.__jovieApiMock).toBeUndefined();
  });

  it('restores a previously registered __jovieApiMock on unmount', () => {
    const previous = vi.fn();
    apiMockWindow.__jovieApiMock = previous;

    const { unmount } = renderDecorator(() => <div />);
    unmount();

    expect(apiMockWindow.__jovieApiMock).toBe(previous);
  });

  it('answers get-session with the signed-in user and session', async () => {
    const mock = createSignedInApiMock();
    const response = await mock({
      url: new URL('http://localhost/api/auth/get-session'),
    });

    const body = await response?.json();
    expect(body.user).toMatchObject({
      id: 'story-user',
      email: 'tim@example.com',
      username: 'timwhite',
    });
    expect(body.session).toMatchObject({
      id: 'story-session',
      userId: 'story-user',
    });
  });

  it('answers list-sessions with the current session entry', async () => {
    const mock = createSignedInApiMock();
    const response = await mock({
      url: new URL('http://localhost/api/auth/list-sessions'),
    });

    const body = await response?.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body[0]).toMatchObject({ id: 'story-session' });
  });

  it('returns undefined for unrelated requests so other mocks can respond', () => {
    const mock = createSignedInApiMock();
    const result = mock({
      url: new URL('http://localhost/api/other'),
      init: { method: 'POST' },
    });

    expect(result).toBeUndefined();
  });
});
