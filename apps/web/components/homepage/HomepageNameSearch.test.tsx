import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HomepageNameSearch } from './HomepageNameSearch';

// Assert the Link prop independently of Next's production-only prefetch work.
vi.mock('next/link', async () => {
  const { createElement, forwardRef } = await import('react');
  return {
    default: forwardRef<
      HTMLAnchorElement,
      import('react').ComponentProps<'a'> & { prefetch?: boolean }
    >(function PrefetchObservedLink({ prefetch, ...props }, ref) {
      return createElement('a', {
        ...props,
        ref,
        'data-test-prefetch': String(prefetch),
      });
    }),
  };
});

afterEach(() => vi.unstubAllGlobals());

function submit(name = 'Alex Example') {
  fireEvent.change(screen.getByRole('textbox', { name: 'Search your name' }), {
    target: { value: name },
  });
  const form = screen
    .getByRole('textbox', { name: 'Search your name' })
    .closest('form');
  if (!form) throw new Error('Name discovery must have a form');
  fireEvent.submit(form);
}

describe('homepage read-only name discovery', () => {
  it('uses a private waitlist fallback for native submission before hydration', () => {
    render(<HomepageNameSearch />);
    const input = screen.getByRole('textbox', { name: 'Search your name' });
    expect(input.closest('form')).toHaveAttribute('action', '/waitlist');
    expect(input).not.toHaveAttribute('name');
  });
  it('shows a real public profile and preserves the waitlist and invite recovery', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        profiles: [{ username: 'alex', name: 'Alex Example' }],
      }),
    });
    vi.stubGlobal('fetch', fetch);
    render(<HomepageNameSearch />);
    submit();
    expect(
      await screen.findByRole('link', { name: /Alex Example/ })
    ).toHaveAttribute('href', '/alex');
    expect(screen.getByRole('link', { name: /Alex Example/ })).toHaveAttribute(
      'data-test-prefetch',
      'undefined'
    );
    expect(fetch).toHaveBeenCalledWith(
      '/api/profile/search?q=Alex%20Example',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    expect(
      screen.getByRole('link', { name: 'Join the waitlist' })
    ).toHaveAttribute('href', '#waitlist');
    expect(
      screen.getByRole('link', { name: 'Have an invite? Sign in' })
    ).toHaveAttribute('href', '/signin');
    expect(
      screen.getByRole('link', { name: 'Have an invite? Sign in' })
    ).toHaveAttribute('data-test-prefetch', 'false');
    expect(fetch.mock.calls[0]?.[1]).not.toHaveProperty('method', 'POST');
  });

  it('offers a useful waitlist path when no public result exists', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue({ ok: true, json: async () => ({ profiles: [] }) })
    );
    render(<HomepageNameSearch />);
    submit();
    expect(
      await screen.findByText(/No matching public profile yet/)
    ).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Join the waitlist' })
    ).toBeVisible();
  });

  it('discloses a limited preview rather than reporting complete empty results', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ profiles: [], partial: true }),
      })
    );
    render(<HomepageNameSearch />);
    submit();
    expect(
      await screen.findByText(/This search preview is limited/)
    ).toBeVisible();
    expect(screen.queryByText(/No matching public profile/)).toBeNull();
    expect(
      screen.getByRole('link', { name: 'Join the waitlist' })
    ).toBeVisible();
  });

  it.each([
    { ok: false, json: async () => ({ error: 'Limited' }) },
    { ok: true, json: async () => ({ success: true }) },
  ])(
    'does not mistake a failed or malformed response for success',
    async response => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
      render(<HomepageNameSearch />);
      submit();
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Search is unavailable'
      );
      expect(screen.getByRole('button', { name: 'Find me' })).toBeEnabled();
      expect(
        screen.getByRole('link', { name: 'Join the waitlist' })
      ).toBeVisible();
    }
  );

  it('rejects external or malformed profile destinations', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          profiles: [
            { username: '//evil.example', name: 'Unsafe' },
            { username: 'good', name: 'Good' },
          ],
        }),
      })
    );
    render(<HomepageNameSearch />);
    submit();
    await screen.findByRole('link', { name: /Good/ });
    expect(screen.queryByText('Unsafe')).not.toBeInTheDocument();
  });

  it('cancels an outstanding search when the name changes and never paints stale matches', async () => {
    let resolve: (value: unknown) => void = () => {};
    const pending = new Promise(done => {
      resolve = done;
    });
    const fetch = vi.fn().mockReturnValue(pending);
    vi.stubGlobal('fetch', fetch);
    render(<HomepageNameSearch />);
    submit('Alex');
    expect(screen.getByRole('button', { name: 'Finding…' })).toBeDisabled();
    const signal = fetch.mock.calls[0][1].signal as AbortSignal;
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'New name' },
    });
    expect(signal.aborted).toBe(true);
    resolve({
      ok: true,
      json: async () => ({ profiles: [{ username: 'alex', name: 'Alex' }] }),
    });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Find me' })).toBeEnabled()
    );
    expect(screen.queryByRole('link', { name: /jov.ie\/alex/ })).toBeNull();
    expect(screen.getByRole('textbox')).toHaveValue('New name');
  });

  it('requires a useful name and keeps focus without making a request', () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    render(<HomepageNameSearch />);
    submit(' ');
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox')).toHaveFocus();
  });

  it('recovers from a transport error without opening signup', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));
    const { container } = render(<HomepageNameSearch />);
    submit();
    await waitFor(() => expect(screen.getByRole('alert')).toBeVisible());
    expect(
      container.querySelector('a[href*="signup"], a[href*="/start"]')
    ).toBeNull();
  });
});
