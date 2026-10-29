import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CopyRowList } from './CopyRowList';

const rows = [
  {
    id: 'HOME-1',
    route: '/',
    section: 'Hero',
    role: 'h1',
    text: 'Be found.',
    source: 'a.ts:1',
  },
  {
    id: 'HOME-2',
    route: '/',
    section: 'Hero',
    role: 'body',
    text: 'A free profile.',
    source: 'a.ts:2',
  },
];

afterEach(() => vi.unstubAllGlobals());

describe('CopyRowList', () => {
  it('shows the ID, text and the latest verdict', () => {
    render(
      <CopyRowList
        rows={rows}
        verdicts={{ 'HOME-1': { verdict: 'sucks', note: 'too long' } }}
      />
    );
    expect(screen.getByText('HOME-1')).toBeTruthy();
    expect(screen.getByText('Be found.')).toBeTruthy();
    expect(screen.getByText('sucks · too long')).toBeTruthy();
  });

  it('posts the verdict and note on one tap', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    render(<CopyRowList rows={rows} verdicts={{}} />);
    fireEvent.change(screen.getByLabelText('Note for HOME-2'), {
      target: { value: 'say it plainer' },
    });
    fireEvent.click(
      screen.getAllByRole('button', { name: 'meh' })[1] as HTMLElement
    );
    await waitFor(() =>
      expect(screen.getByText('meh · say it plainer')).toBeTruthy()
    );
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/admin/copy-jam/verdict');
    expect(JSON.parse(init.body as string)).toEqual({
      copyId: 'HOME-2',
      verdict: 'meh',
      note: 'say it plainer',
    });
  });

  it('says so when a save fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500 })
    );
    render(<CopyRowList rows={rows} verdicts={{}} />);
    fireEvent.click(
      screen.getAllByRole('button', { name: 'great' })[0] as HTMLElement
    );
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('Not saved')
    );
  });
});
