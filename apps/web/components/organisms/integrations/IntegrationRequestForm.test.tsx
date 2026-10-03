import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IntegrationRequestForm } from './IntegrationRequestForm';

function fill() {
  fireEvent.change(screen.getByLabelText('Tool Or Service'), {
    target: { value: 'New Service' },
  });
  fireEvent.change(screen.getByLabelText('What Would You Like To Do?'), {
    target: { value: 'Import all my releases.' },
  });
}
describe('IntegrationRequestForm', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('reports a persisted draft and preserves input', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 202 })
    );
    render(<IntegrationRequestForm />);
    fill();
    fireEvent.click(
      screen.getByRole('button', { name: 'Request Integration' })
    );
    await screen.findByText(
      'Request saved. An integration draft has been created for review.'
    );
    expect(
      (screen.getByLabelText('Tool Or Service') as HTMLInputElement).value
    ).toBe('New Service');
  });
  it('keeps a recoverable error and offers sign-in without discarding text', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401 })
    );
    render(<IntegrationRequestForm />);
    fill();
    fireEvent.click(
      screen.getByRole('button', { name: 'Request Integration' })
    );
    expect(
      await screen.findByRole('link', { name: 'Sign In In A New Tab' })
    ).toBeDefined();
    expect(
      (screen.getByLabelText('Tool Or Service') as HTMLInputElement).value
    ).toBe('New Service');
  });
  it('supports retry after network failure', async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ ok: true, status: 202 });
    vi.stubGlobal('fetch', fetch);
    render(<IntegrationRequestForm />);
    fill();
    fireEvent.click(
      screen.getByRole('button', { name: 'Request Integration' })
    );
    await screen.findByText(
      'Connection interrupted. Your text is still here; please retry.'
    );
    await waitFor(() =>
      expect(
        (
          screen.getByRole('button', {
            name: 'Request Integration',
          }) as HTMLButtonElement
        ).disabled
      ).toBe(false)
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Request Integration' })
    );
    await screen.findByText(
      'Request saved. An integration draft has been created for review.'
    );
  });
});
