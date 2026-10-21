import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiKeysCard } from './ApiKeysCard';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  revoke: vi.fn(),
}));
vi.mock('@/lib/auth/client', () => ({
  authClient: {
    apiKey: { list: mocks.list, create: mocks.create, delete: mocks.revoke },
  },
}));
const secret = 'jovie_' + 'x'.repeat(64);
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <ApiKeysCard userId='user' />
    </QueryClientProvider>
  );
  const disclosure = screen.getByText('API Keys').closest('details')!;
  return {
    client,
    disclosure,
    open: () => {
      disclosure.open = true;
      fireEvent(disclosure, new Event('toggle'));
    },
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.list.mockResolvedValue({ data: { apiKeys: [] }, error: null });
  mocks.create.mockResolvedValue({
    data: { id: 'key', key: secret },
    error: null,
  });
  mocks.revoke.mockResolvedValue({ data: { success: true }, error: null });
});

describe('API key settings', () => {
  it('loads only on disclosure, shows empty state and reveals a minted secret once without caching it', async () => {
    const { client, disclosure, open } = mount();
    expect(mocks.list).not.toHaveBeenCalled();
    open();
    expect(await screen.findByText('No API keys yet.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Key name'), {
      target: { value: 'Build agent' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create Key' }));
    expect(await screen.findByText(secret)).toBeTruthy();
    expect(mocks.create).toHaveBeenCalledWith({ name: 'Build agent' });
    expect(JSON.stringify(client.getQueryCache().getAll())).not.toContain(
      secret
    );
    expect(JSON.stringify(client.getMutationCache().getAll())).not.toContain(
      secret
    );
    disclosure.open = false;
    fireEvent(disclosure, new Event('toggle'));
    await waitFor(() => expect(screen.queryByText(secret)).toBeNull());
    open();
    expect(screen.queryByText(secret)).toBeNull();
  });

  it('shows loading and error recovery in a fixed list frame', async () => {
    let resolve!: (value: unknown) => void;
    mocks.list.mockImplementationOnce(
      () =>
        new Promise(done => {
          resolve = done;
        })
    );
    const { open } = mount();
    open();
    const loading = await screen.findByText('Loading keys…');
    const frame = loading.parentElement!;
    expect(frame).toHaveClass('h-48', 'overflow-y-auto');
    resolve({ error: { message: 'failed' }, data: null });
    expect(await screen.findByText('Could not load API keys.')).toBeTruthy();
    expect(
      screen.getByText('Could not load API keys.').closest('[aria-busy]')
    ).toBe(frame);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('No API keys yet.')).toBeTruthy();
    expect(screen.getByText('No API keys yet.').parentElement).toBe(frame);
  });

  it('requires a revoke confirmation, preserves keys on failure, and refreshes after success', async () => {
    mocks.list.mockResolvedValue({
      data: { apiKeys: [{ id: 'key', name: 'Build agent', start: 'jovie_x' }] },
      error: null,
    });
    mocks.revoke.mockResolvedValueOnce({ error: { message: 'failed' } });
    const { open } = mount();
    open();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Revoke Build agent' })
    );
    expect(mocks.revoke).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke Key' }));
    await waitFor(() =>
      expect(mocks.revoke).toHaveBeenCalledWith({ keyId: 'key' })
    );
    expect(
      await screen.findByText('Could not revoke this key. Try again.')
    ).toBeTruthy();
    expect(screen.getByText('Build agent')).toBeTruthy();
    mocks.list.mockResolvedValue({ data: { apiKeys: [] }, error: null });
    fireEvent.click(screen.getByRole('button', { name: 'Revoke Key' }));
    expect(await screen.findByText('No API keys yet.')).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByLabelText('Key name')).toHaveFocus()
    );
  });
});
