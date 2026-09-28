import { render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { withSignedInSession } from '@/.storybook/signed-in-session';

function renderDecorator(story: () => React.ReactElement) {
  return render(<>{withSignedInSession(story, {} as never)}</>);
}

describe('withSignedInSession', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('patches fetch before the story mounts and restores it on unmount', () => {
    const originalFetch = globalThis.fetch;
    let fetchDuringMount: typeof fetch | undefined;

    const { unmount } = renderDecorator(() => {
      fetchDuringMount = globalThis.fetch;
      return <div data-testid='story' />;
    });

    expect(screen.getByTestId('story')).toBeTruthy();
    expect(fetchDuringMount).not.toBe(originalFetch);

    unmount();
    expect(globalThis.fetch).toBe(originalFetch);
  });

  it('answers get-session with the signed-in user and session', async () => {
    renderDecorator(() => <div />);

    const response = await globalThis.fetch(
      'http://localhost/api/auth/get-session'
    );
    const body = await response.json();

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
    renderDecorator(() => <div />);

    const response = await globalThis.fetch(
      'http://localhost/api/auth/list-sessions'
    );
    const body = await response.json();

    expect(Array.isArray(body)).toBe(true);
    expect(body[0]).toMatchObject({ id: 'story-session' });
  });

  it('passes unrelated requests through to the original fetch', async () => {
    const passthrough = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('ok'));

    renderDecorator(() => <div />);

    await globalThis.fetch('http://localhost/api/other', { method: 'POST' });
    expect(passthrough).toHaveBeenCalledWith(
      'http://localhost/api/other',
      expect.objectContaining({ method: 'POST' })
    );
  });
});
