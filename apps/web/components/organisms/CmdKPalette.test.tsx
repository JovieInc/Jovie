import { fireEvent, render, screen } from '@testing-library/react';
import { type ReactNode, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { CmdKPalette } from './CmdKPalette';

const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn() }),
}));

vi.mock('next/image', () => ({
  default: ({ alt, src }: { alt: string; src: string }) => (
    <span data-testid='img' data-src={src} data-alt={alt} />
  ),
}));

vi.mock('@/lib/queries/useReleasesQuery', () => ({
  useReleasesQuery: () => ({ data: [], isLoading: false }),
}));

vi.mock('@/lib/queries/useArtistSearchQuery', () => ({
  useArtistSearchQuery: () => ({
    results: [],
    state: 'idle',
    search: vi.fn(),
    clear: vi.fn(),
  }),
}));

vi.mock('@/lib/queries/useChatCapabilitiesQuery', () => ({
  useChatCapabilitiesQuery: () => ({
    data: {
      tools: {
        albumArt: {
          availability: 'available',
          reason: null,
          reasonCode: null,
        },
      },
    },
    isLoading: false,
    isError: false,
  }),
}));

function MainPlaneHarness() {
  const [header, setHeader] = useState<ReactNode>(null);

  return (
    <>
      <header>{header}</header>
      <CmdKPalette
        profileId='profile-1'
        open
        onOpenChange={vi.fn()}
        presentation='main'
        onHeaderChange={setHeader}
      />
    </>
  );
}

describe('CmdKPalette', () => {
  it('commits the currently filtered main-plane result with Enter', () => {
    pushMock.mockClear();
    render(<MainPlaneHarness />);

    const input = screen.getByRole('combobox', {
      name: 'Command Palette Search',
    });
    fireEvent.change(input, { target: { value: 'Calendar' } });

    expect(
      screen.getByRole('option', {
        name: 'Calendar Plan release dates and campaign moments. ⌘1',
      })
    ).toHaveAttribute('aria-selected', 'true');
    expect(
      screen.getByRole('option', {
        name: 'Calendar Plan release dates and campaign moments. ⌘1',
      })
    ).toHaveClass('system-b-table-row-shell');

    fireEvent.keyDown(input, { key: 'Enter' });

    expect(pushMock).toHaveBeenCalledWith('/app/calendar');
  });

  it('keeps dense table results keyboard-selectable before committing', () => {
    render(<MainPlaneHarness />);

    const input = screen.getByRole('combobox', {
      name: 'Command Palette Search',
    });
    const profile = screen.getByRole('option', {
      name: 'Profile Open your profile in the chat workspace. ⌘1',
    });

    expect(profile).toHaveAttribute('aria-selected', 'true');
    expect(profile).toHaveClass('system-b-table-row-shell');

    fireEvent.keyDown(input, { key: 'ArrowDown' });

    expect(
      screen.getByRole('option', {
        name: 'Connections Manage artist identities and connected services. ⌘2',
      })
    ).toHaveAttribute('aria-selected', 'true');
  });
});
