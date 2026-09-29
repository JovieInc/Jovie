import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AskJovieWidget } from './AskJovieWidget';

vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));

// jsdom does not implement Element.scrollTo.
window.HTMLElement.prototype.scrollTo = vi.fn();

const WIDGET = <AskJovieWidget username='test' artistName='Test Artist' />;

function mockFetch(
  impl: (body: Record<string, unknown>) => Promise<Record<string, unknown>>
) {
  const fetchMock = vi.fn((_url: string, init?: RequestInit) =>
    impl(JSON.parse(String(init?.body ?? '{}'))).then(payload => ({
      ok: true,
      json: () => Promise.resolve(payload),
    }))
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const openWidget = () =>
  fireEvent.click(
    screen.getByRole('button', { name: 'Ask Jovie about Test Artist' })
  );

describe('AskJovieWidget', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('opens from the keyboard without sending a question or message', async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch(() => Promise.resolve({}));
    render(WIDGET);
    await user.tab();
    expect(
      screen.getByRole('button', { name: 'Ask Jovie about Test Artist' })
    ).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(
      screen.getByRole('dialog', { name: 'Ask Jovie about Test Artist' })
    ).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('opens the dialog with a greeting and suggested questions', () => {
    render(WIDGET);
    openWidget();

    expect(
      screen.getByRole('dialog', { name: 'Ask Jovie about Test Artist' })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Ask me anything about Test Artist/)
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Tell me about this artist' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'New Music Alerts' })
    ).toBeInTheDocument();
  });

  it('posts a question and renders the grounded answer', async () => {
    const fetchMock = mockFetch(body =>
      Promise.resolve(
        body.action === 'question'
          ? {
              answered: true,
              text: 'Start with “Neon Skyline”.',
              intent: 'release_recommendation',
              provenance: { sourceRevision: 'ask-jovie-v1-release' },
              followUp: {
                intent: 'new_release_alerts',
                label: 'Want release alerts?',
              },
              card: {
                id: 'neon-skyline',
                kind: 'music',
                href: '/test/neon-skyline',
                imageUrl: null,
                imageAlt: 'Neon Skyline artwork',
                title: 'Neon Skyline',
                meta: 'Single · 2026',
                cta: { label: 'Listen', href: '/test/neon-skyline' },
              },
            }
          : {}
      )
    );
    render(WIDGET);
    openWidget();
    fireEvent.click(
      screen.getByRole('button', { name: 'What song should I start with?' })
    );

    expect(await screen.findByText('Start with “Neon Skyline”.')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/profile/test/ask',
      expect.objectContaining({ method: 'POST' })
    );
    expect(screen.getByTestId('ask-jovie-music-card')).toHaveTextContent(
      'Listen'
    );
    expect(
      screen.getByRole('button', { name: 'Want release alerts?' })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('ask-jovie-music-card'));
    await waitFor(() => {
      const outcomeCall = fetchMock.mock.calls
        .map(c => JSON.parse(String(c[1]?.body)))
        .find(b => b.action === 'outcome');
      expect(outcomeCall).toMatchObject({
        intent: 'release_recommendation',
        outcome: 'listen',
        entityType: 'music',
        entityId: 'neon-skyline',
        sourceRevision: 'ask-jovie-v1-release',
      });
    });
  });

  it('escalates an unanswered question to the owner with contact info', async () => {
    mockFetch(body =>
      Promise.resolve(
        body.action === 'question'
          ? { answered: false }
          : body.action === 'message'
            ? { success: true }
            : {}
      )
    );
    render(WIDGET);
    openWidget();

    const input = screen.getByPlaceholderText('Ask about Test Artist…');
    fireEvent.change(input, { target: { value: 'What is their rider?' } });
    fireEvent.submit(input.closest('form')!);

    expect(
      await screen.findByText(/I don't have that on file for Test Artist/)
    ).toBeTruthy();

    fireEvent.click(
      screen.getByRole('button', { name: 'Send to Test Artist' })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Booking' }));
    fireEvent.change(screen.getByPlaceholderText('Name (optional)'), {
      target: { value: 'Pat' },
    });
    fireEvent.change(
      screen.getByPlaceholderText('Email (optional, for a reply)'),
      { target: { value: 'pat@example.com' } }
    );
    fireEvent.click(screen.getByRole('button', { name: 'Send Message' }));

    expect(
      await screen.findByText(/Done — I sent that to Test Artist/)
    ).toBeTruthy();
  });

  it('captures a local-show-alerts intent with email and city', async () => {
    const fetchMock = mockFetch(body =>
      Promise.resolve(body.action === 'intent' ? { success: true } : {})
    );
    render(WIDGET);
    openWidget();

    fireEvent.click(screen.getByRole('button', { name: 'Local Show Alerts' }));
    fireEvent.change(screen.getByPlaceholderText('Email'), {
      target: { value: 'fan@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('Your city'), {
      target: { value: 'Portland' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Notify Me' }));

    expect(
      await screen.findByText(/I'll let you know when Test Artist plays/)
    ).toBeTruthy();

    await waitFor(() => {
      const intentCall = fetchMock.mock.calls
        .map(c => JSON.parse(String(c[1]?.body)))
        .find(b => b.action === 'intent');
      expect(intentCall).toMatchObject({
        intent: 'local_show_alerts',
        email: 'fan@example.com',
        city: 'Portland',
      });
    });
  });

  it('closes via the header button', () => {
    render(WIDGET);
    openWidget();
    fireEvent.click(screen.getByRole('button', { name: 'Close Ask Jovie' }));
    expect(
      screen.queryByRole('dialog', { name: 'Ask Jovie about Test Artist' })
    ).toBeNull();
  });
});
