import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const track = vi.hoisted(() => vi.fn());
const push = vi.hoisted(() => vi.fn());
const fetchMock = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/lib/analytics', () => ({ track }));
vi.mock('@/lib/queries/fetch', () => ({ fetchWithTimeout: fetchMock }));

import { SaveViewButton } from './SaveViewButton';

const TOKEN = 'a'.repeat(32);

describe('SaveViewButton', () => {
  beforeEach(() => {
    track.mockClear();
    push.mockClear();
    fetchMock.mockReset();
  });

  it('saves, tracks and routes to the saved copy', async () => {
    fetchMock.mockResolvedValue({ token: 'n'.repeat(32), created: false });
    render(<SaveViewButton token={TOKEN} viewerOwnsView={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save as dashboard' }));
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(`/v/${'n'.repeat(32)}`)
    );
    expect(track).toHaveBeenCalledWith('shared_view_saved', { created: false });
  });

  it('shows an inline error and re-enables on failure', async () => {
    fetchMock.mockRejectedValue(new Error('boom'));
    render(<SaveViewButton token={TOKEN} viewerOwnsView={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save as dashboard' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Save as dashboard' })
    ).toBeEnabled();
  });

  it('links to dashboards when the viewer owns the view', () => {
    render(<SaveViewButton token={TOKEN} viewerOwnsView />);
    expect(
      screen.getByRole('link', { name: 'In your dashboards' })
    ).toHaveAttribute('href', '/app/dashboards');
  });
});
