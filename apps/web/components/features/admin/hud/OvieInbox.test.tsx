import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { OvieInbox } from './OvieInbox';

function renderInbox() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  function Wrapper({ children }: { readonly children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  }
  return render(<OvieInbox />, { wrapper: Wrapper });
}

describe('OvieInbox', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps a loaded decision inside a fixed scrollport', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          cases: [
            {
              id: 'case-1',
              title: 'Hold the payout',
              body: `${'A long founder decision. '.repeat(40)}\n`,
              recommendation: 'Wait for the window to close.',
              evidence: [],
            },
          ],
          issues: [],
        }),
      })
    );

    renderInbox();

    const scrollport = screen.getByTestId('ovie-inbox-scrollport');
    expect(scrollport.className).toContain('h-64');
    expect(scrollport.className).toContain('overflow-hidden');
    expect(scrollport.className).not.toContain('min-h-64');
    expect(scrollport.querySelector('.overflow-y-auto')).not.toBeNull();

    await waitFor(() => {
      expect(screen.getByTestId('ovie-inbox-decision')).toBeInTheDocument();
    });
    expect(scrollport).toContainElement(
      screen.getByTestId('ovie-inbox-decision')
    );
  });
});
