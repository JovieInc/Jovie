import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActionDial, type ActionDialOption } from './ActionDial';

const OPTIONS: ActionDialOption[] = [
  {
    id: 'spotify',
    label: 'Spotify',
    href: 'https://open.spotify.com/song',
    icon: <span>Spotify icon</span>,
  },
  {
    id: 'apple',
    label: 'Apple Music',
    href: 'https://music.apple.com/song',
    icon: <span>Apple icon</span>,
  },
  {
    id: 'deezer',
    label: 'Deezer',
    href: 'https://deezer.com/song',
    icon: <span>Deezer icon</span>,
  },
];

function mockMotion(reduced: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: reduced && query.includes('reduce'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const status = () => screen.getByRole('status').textContent;

describe('ActionDial preferred state', () => {
  it('labels the centered service and marks a remembered preference', async () => {
    mockMotion(true);
    render(
      <ActionDial
        options={OPTIONS}
        selectedId='apple'
        preferredId='apple'
        onSelect={vi.fn()}
        actionLabel='Stream Now'
        groupLabel='Choose a streaming service'
      />
    );
    expect(screen.getByTestId('action-dial')).toHaveAttribute(
      'data-preferred',
      'true'
    );
    expect(screen.getByTestId('action-dial-selection')).toHaveTextContent(
      'Remembered'
    );
    expect(status()).toBe('Apple Music selected, remembered');
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'ArrowDown' });
    await waitFor(() =>
      expect(screen.getByTestId('action-dial')).toHaveAttribute(
        'data-preferred',
        'false'
      )
    );
    expect(screen.getByTestId('action-dial-selection')).toHaveTextContent(
      'Deezer'
    );
    expect(screen.getByTestId('action-dial-selection')).not.toHaveTextContent(
      'Remembered'
    );
    await waitFor(() => expect(status()).toBe('Deezer selected'));
  });

  it('keeps preferred row metadata while another option is centered', () => {
    mockMotion(true);
    render(
      <ActionDial
        options={OPTIONS}
        selectedId='spotify'
        preferredId='deezer'
        onSelect={vi.fn()}
        actionLabel='Stream Now'
        groupLabel='G'
      />
    );
    expect(screen.getByTestId('action-dial')).toHaveAttribute(
      'data-preferred',
      'false'
    );
    expect(screen.getByRole('option', { name: 'Deezer' })).toHaveAttribute(
      'data-preferred',
      'true'
    );
    expect(screen.getByTestId('action-dial-selection')).toHaveTextContent(
      'Spotify'
    );
  });

  it('keeps service icons first-class against Stream Now chrome', () => {
    mockMotion(true);
    render(
      <ActionDial
        options={OPTIONS}
        selectedId='spotify'
        preferredId='spotify'
        onSelect={vi.fn()}
        actionLabel='Stream Now'
        groupLabel='G'
      />
    );
    expect(screen.getByTestId('action-dial-icon-track')).toHaveClass(
      'h-7',
      'w-7'
    );
    expect(screen.getByText('Stream Now')).toHaveClass('text-sm');
    expect(screen.getByTestId('action-dial-selection')).toHaveTextContent(
      'Remembered'
    );
  });
});
