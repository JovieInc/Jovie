import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DevDspDialPage from './page';

vi.mock('@/lib/hooks/useReducedMotion', () => ({
  useReducedMotion: () => true,
}));

beforeEach(() => {
  localStorage.clear();
});

async function renderPage(params: { fixture?: string; count?: string }) {
  render(await DevDspDialPage({ searchParams: Promise.resolve(params) }));
  return screen.getByRole('listbox', { name: 'Choose a streaming service' });
}

describe('development service dial harness', () => {
  it('defaults to the real providers and records selection separately from activation', async () => {
    const dial = await renderPage({});
    expect(screen.getAllByRole('option')).toHaveLength(3);
    expect(screen.getByTestId('dial-selected')).toHaveTextContent('spotify');
    expect(screen.getByTestId('dial-activated')).toBeEmptyDOMElement();

    fireEvent.click(
      screen.getByRole('link', { name: 'Stream Now with Spotify' })
    );
    expect(screen.getByTestId('dial-activated')).toHaveTextContent('spotify');
    fireEvent.keyDown(dial, { key: 'End' });
    expect(screen.getByTestId('dial-selected')).toHaveTextContent('deezer');
    expect(screen.getByTestId('dial-activated')).toHaveTextContent('spotify');
    fireEvent.click(
      screen.getByRole('link', { name: 'Stream Now with Deezer' })
    );
    expect(screen.getByTestId('dial-activated')).toHaveTextContent('deezer');
  });

  it('falls back to real providers for an unknown fixture', async () => {
    await renderPage({ fixture: 'unknown', count: '200' });
    expect(screen.getAllByRole('option')).toHaveLength(3);
    expect(screen.getByRole('option', { name: 'Spotify' })).toBeInTheDocument();
  });

  it.each([
    [undefined, 100],
    ['invalid', 100],
    ['0', 100],
    ['8', 8],
    ['999', 200],
  ])('bounds synthetic count %s to %i destinations', async (count, total) => {
    const dial = await renderPage({ fixture: 'synthetic', count });
    expect(screen.getByTestId('dial-selected')).toHaveTextContent('dest-001');
    expect(screen.getAllByRole('option')[0]).toHaveAttribute(
      'aria-setsize',
      String(total)
    );
    fireEvent.keyDown(dial, { key: 'End' });
    const lastId = `dest-${String(total).padStart(3, '0')}`;
    expect(screen.getByTestId('dial-selected')).toHaveTextContent(lastId);
    fireEvent.click(screen.getByRole('link', { name: /Stream Now with/ }));
    expect(screen.getByTestId('dial-activated')).toHaveTextContent(lastId);
  });

  it('clamps a negative count to one directly activatable destination', async () => {
    render(
      await DevDspDialPage({
        searchParams: Promise.resolve({ fixture: 'synthetic', count: '-5' }),
      })
    );
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByTestId('dial-selected')).toHaveTextContent('dest-001');
    const link = screen.getByRole('link', {
      name: 'Stream Now with Spotify 001',
    });
    expect(link).toHaveAttribute('href', '#stream-1');
    fireEvent.click(link);
    expect(screen.getByTestId('dial-activated')).toHaveTextContent('dest-001');
  });
});
