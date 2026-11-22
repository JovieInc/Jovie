import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SAMPLE_VIEW_SPEC } from './ViewRenderer.stories';

const track = vi.hoisted(() => vi.fn());
vi.mock('@/lib/analytics', () => ({ track }));
vi.mock('./ViewTable', () => ({ ViewTable: () => <div /> }));
vi.mock('@/components/shell/Sparkline', () => ({ Sparkline: () => <div /> }));

import { SharedViewPage } from './SharedViewPage';

const view = {
  title: 'Weekly snapshot',
  spec: SAMPLE_VIEW_SPEC,
  updatedAt: new Date('2026-11-22T00:00:00Z'),
};

describe('SharedViewPage', () => {
  beforeEach(() => track.mockClear());

  it('shows the signup prompt to signed-out visitors and tracks the click', () => {
    render(<SharedViewPage view={view} signedIn={false} />);
    expect(track).toHaveBeenCalledWith('shared_view_viewed', {
      signedIn: false,
    });
    const signUp = screen.getByRole('link', { name: 'Sign up' });
    expect(signUp.getAttribute('href')).toBe('/signup?ref=view');
    fireEvent.click(signUp);
    expect(track).toHaveBeenCalledWith('shared_view_signup_click');
    expect(screen.queryByText('Save as dashboard')).toBeNull();
  });

  it('shows a disabled Save as dashboard to signed-in users and no signup prompt', () => {
    render(<SharedViewPage view={view} signedIn />);
    const save = screen.getByRole('button', { name: 'Save as dashboard' });
    expect(save).toBeDisabled();
    expect(save).toHaveAttribute('title', 'Coming next');
    expect(screen.queryByTestId('view-signup-card')).toBeNull();
  });
});
