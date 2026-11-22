import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SAMPLE_VIEW_SPEC } from './ViewRenderer.stories';

const track = vi.hoisted(() => vi.fn());
const push = vi.hoisted(() => vi.fn());
const fetchMock = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/lib/queries/fetch', () => ({ fetchWithTimeout: fetchMock }));
const TOKEN = 'a'.repeat(32);
vi.mock('@/lib/analytics', () => ({ track }));
vi.mock('./ViewTable', () => ({ ViewTable: () => <div /> }));
vi.mock('@/components/shell/Sparkline', () => ({ Sparkline: () => <div /> }));

import { ViewShell } from './ViewShell';

const view = {
  title: 'Weekly snapshot',
  spec: SAMPLE_VIEW_SPEC,
  updatedAt: new Date('2026-11-22T00:00:00Z'),
};

describe('ViewShell', () => {
  beforeEach(() => {
    track.mockClear();
    push.mockClear();
    fetchMock.mockReset();
  });

  it('shows the signup prompt to signed-out visitors and tracks the click', () => {
    render(<ViewShell view={view} token={TOKEN} signedIn={false} />);
    expect(track).toHaveBeenCalledWith('shared_view_viewed', {
      signedIn: false,
    });
    const signUp = screen.getByRole('link', { name: 'Sign up' });
    expect(signUp.getAttribute('href')).toBe('/signup?ref=view');
    fireEvent.click(signUp);
    expect(track).toHaveBeenCalledWith('shared_view_signup_click');
    expect(screen.queryByText('Save as dashboard')).toBeNull();
  });

  it('saves a view for signed-in users and routes to the copy', async () => {
    fetchMock.mockResolvedValue({
      url: 'https://jov.ie/v/n',
      token: 'n'.repeat(32),
      created: true,
    });
    render(<ViewShell view={view} token={TOKEN} signedIn />);
    expect(screen.queryByTestId('view-signup-card')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Save as dashboard' }));
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(`/v/${'n'.repeat(32)}`)
    );
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/views/${TOKEN}/save`,
      expect.objectContaining({ method: 'POST' })
    );
    expect(track).toHaveBeenCalledWith('shared_view_saved', { created: true });
  });

  it('shows an inline error and re-enables the button on failure', async () => {
    fetchMock.mockRejectedValue(new Error('boom'));
    render(<ViewShell view={view} token={TOKEN} signedIn />);
    fireEvent.click(screen.getByRole('button', { name: 'Save as dashboard' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not save this view'
    );
    expect(
      screen.getByRole('button', { name: 'Save as dashboard' })
    ).toBeEnabled();
    expect(push).not.toHaveBeenCalled();
  });

  it('shows In your dashboards when the viewer owns the view', () => {
    render(<ViewShell view={view} token={TOKEN} signedIn viewerOwnsView />);
    expect(
      screen.queryByRole('button', { name: 'Save as dashboard' })
    ).toBeNull();
    expect(
      screen.getByRole('link', { name: 'In your dashboards' })
    ).toHaveAttribute('href', '/app/dashboards');
  });
});
