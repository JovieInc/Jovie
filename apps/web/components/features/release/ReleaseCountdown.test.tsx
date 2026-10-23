import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReleaseCountdown } from './ReleaseCountdown';

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
const router = { refresh };

vi.mock('next/navigation', () => ({ useRouter: () => router }));

const NOW = new Date('2031-04-16T16:00:00.000Z');

describe('ReleaseCountdown', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW });
    refresh.mockClear();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('renders a year token for a distant release in compact mode', () => {
    render(
      <ReleaseCountdown
        releaseDate={new Date('2032-04-16T16:00:00.000Z')}
        compact
      />
    );

    expect(screen.getByText('1')).toBeVisible();
    expect(screen.getByText('YR')).toBeVisible();
    expect(screen.queryByText('D')).not.toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('renders days, hours and minutes with the supplied label', () => {
    render(
      <ReleaseCountdown
        releaseDate={new Date('2031-04-18T19:04:00.000Z')}
        label='Release starts in'
      />
    );

    expect(screen.getByText('Release starts in')).toBeVisible();
    expect(screen.getByText('2')).toBeVisible();
    expect(screen.getByText('days')).toBeVisible();
    expect(screen.getByText('3')).toBeVisible();
    expect(screen.getByText('hrs')).toBeVisible();
    expect(screen.getByText('4')).toBeVisible();
    expect(screen.getByText('min')).toBeVisible();
  });

  it('updates the countdown and refreshes once when the release arrives', () => {
    const { container } = render(
      <ReleaseCountdown
        releaseDate={new Date(NOW.getTime() + 120_000)}
        compact
      />
    );
    expect(screen.getByText('2')).toBeVisible();

    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.getByText('1')).toBeVisible();
    expect(refresh).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(60_000));
    expect(container).toBeEmptyDOMElement();
    expect(refresh).toHaveBeenCalledTimes(1);

    act(() => vi.advanceTimersByTime(120_000));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it.each([new Date(NOW.getTime() - 1), new Date(Number.NaN)])(
    'hides an expired or invalid release date and refreshes once (%s)',
    releaseDate => {
      const { container } = render(
        <ReleaseCountdown releaseDate={releaseDate} />
      );
      expect(container).toBeEmptyDOMElement();
      expect(refresh).toHaveBeenCalledTimes(1);
    }
  );

  it('clears its update timer on unmount', () => {
    const { unmount } = render(
      <ReleaseCountdown releaseDate={new Date(NOW.getTime() + 120_000)} />
    );
    unmount();
    act(() => vi.advanceTimersByTime(180_000));
    expect(refresh).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
