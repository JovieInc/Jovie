import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPilotReviewCase } from '@/lib/ovie/review-inbox/pilot-fixture';
import { ReviewInboxPilotWorkbench } from './ReviewInboxPilotWorkbench';

function Wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('ReviewInboxPilotWorkbench', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.url;
        if (
          url.includes('/api/ovie/inbox') &&
          init?.method?.toUpperCase() === 'POST'
        ) {
          return new Response(JSON.stringify({ receipt: { ack: true } }), {
            status: 200,
          });
        }
        return new Response(JSON.stringify({ case: createPilotReviewCase() }), {
          status: 200,
        });
      })
    );
  });

  it('renders list and editorial views for the synthetic pilot case', async () => {
    render(<ReviewInboxPilotWorkbench />, { wrapper: Wrapper });
    expect(
      await screen.findByTestId('review-inbox-pilot-workbench')
    ).toBeTruthy();
    expect(screen.getByTestId('review-inbox-list-view')).toBeTruthy();
    await userEvent.click(screen.getByRole('radio', { name: 'Decision' }));
    await waitFor(() =>
      expect(screen.getByTestId('review-inbox-editorial-view')).toBeTruthy()
    );
    expect(
      screen.getByTestId('review-inbox-approval-disclosure')
    ).toHaveTextContent(/private test library/i);
  });
});
