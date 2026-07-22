import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { HeaderSearchAdapter } from '@/contexts/HeaderActionsContext';
import { HeaderSearchSurface } from './HeaderSearchSurface';

function createAdapter(
  overrides: Partial<HeaderSearchAdapter> = {}
): HeaderSearchAdapter {
  return {
    key: 'releases',
    pills: [],
    onPillsChange: vi.fn(),
    artistOptions: ['Frank Ocean'],
    titleOptions: ['Pyramids'],
    albumOptions: ['Channel Orange'],
    totalCount: 12,
    visibleCount: 8,
    triggerLabel: 'Search Releases',
    ...overrides,
  };
}

describe('HeaderSearchSurface', () => {
  it('keeps the closed trigger on the compact header height', () => {
    render(
      <HeaderSearchSurface
        adapter={createAdapter()}
        isOpen={false}
        onOpen={vi.fn()}
        onClose={vi.fn()}
      />
    );

    const trigger = screen.getByRole('button', { name: 'Search' });
    expect(trigger.className).toContain('h-7');
    expect(trigger.className).toContain('min-h-7');
    expect(trigger.className).toContain('justify-start');
    expect(trigger.className).toContain('text-left');
  });

  it('keeps the open search surface on the same compact header height', () => {
    const { container } = render(
      <HeaderSearchSurface
        adapter={createAdapter()}
        isOpen
        onOpen={vi.fn()}
        onClose={vi.fn()}
      />
    );

    const surface = container.firstElementChild;
    expect(surface?.className).toContain('h-7');
    expect(surface?.className).toContain('min-h-7');
    expect(surface?.className).toContain('items-center');
    expect(surface?.className).toContain('justify-start');
    expect(surface?.className).toContain('text-left');
    expect(
      screen.getByRole('combobox', { name: 'Search Jovie' })
    ).toBeVisible();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Filter Current View' })
    ).toBeVisible();
  });

  it('keeps contextual pill filters available inside the shared surface', () => {
    render(
      <HeaderSearchSurface
        adapter={createAdapter()}
        isOpen
        onOpen={vi.fn()}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Filter Current View' })
    );

    expect(screen.getByLabelText('Filter Search Releases')).toBeVisible();
  });

  it('renders typed groups with deterministic links and keyboard selection', () => {
    const onPillsChange = vi.fn();
    render(
      <HeaderSearchSurface
        adapter={createAdapter({
          artistOptions: ['Midnight Artist'],
          onPillsChange,
        })}
        catalog={{
          conversations: [
            {
              id: 'thread-1',
              title: 'Midnight rollout',
              createdAt: '2026-07-01T00:00:00.000Z',
              updatedAt: '2026-07-02T00:00:00.000Z',
            },
          ],
          profiles: [
            {
              id: 'profile-1',
              displayName: 'Midnight Artist',
              username: 'midnight-artist',
              usernameNormalized: 'midnight-artist',
            },
          ],
          releases: [
            {
              id: 'release-1',
              title: 'Midnight Drive',
              artistNames: ['Midnight Artist'],
              smartLinkPath: '/midnight-artist/midnight-drive',
            },
          ],
        }}
        isOpen
        onOpen={vi.fn()}
        onClose={vi.fn()}
      />
    );

    const input = screen.getByRole('combobox', { name: 'Search Jovie' });
    fireEvent.change(input, { target: { value: 'midnight' } });

    expect(screen.getByText('Threads')).toBeVisible();
    expect(screen.getByText('Entities')).toBeVisible();
    expect(screen.getByText('Library Assets')).toBeVisible();
    expect(screen.getByText('Current view')).toBeVisible();
    expect(screen.getByRole('group', { name: 'Threads' })).toBeVisible();
    expect(screen.getByRole('group', { name: 'Entities' })).toBeVisible();
    expect(screen.getByRole('group', { name: 'Library Assets' })).toBeVisible();
    expect(screen.getByRole('group', { name: 'Current View' })).toBeVisible();
    const options = screen.getAllByRole('option');
    expect(
      options
        .filter(option => option.hasAttribute('href'))
        .map(option => option.getAttribute('href'))
    ).toEqual([
      '/app/chat/thread-1',
      '/midnight-artist',
      '/midnight-artist/midnight-drive',
    ]);
    expect(options[0]).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(options[1]).toHaveAttribute('aria-selected', 'true');
    const selectedLink = options[1] as HTMLAnchorElement;
    const activateSelectedLink = vi
      .spyOn(selectedLink, 'click')
      .mockImplementation(() => {});
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(activateSelectedLink).toHaveBeenCalledTimes(1);
    expect(selectedLink).toHaveAttribute('href', '/midnight-artist');
    activateSelectedLink.mockRestore();

    fireEvent.click(
      screen.getByRole('option', {
        name: 'Midnight Artist Filter by artist',
      })
    );
    expect(onPillsChange).toHaveBeenCalledWith([
      expect.objectContaining({
        field: 'artist',
        op: 'is',
        values: ['Midnight Artist'],
      }),
    ]);
  });

  it('closes from Escape without rendering a modal surface', () => {
    const onClose = vi.fn();
    render(<HeaderSearchSurface isOpen onOpen={vi.fn()} onClose={onClose} />);

    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Search Jovie' }), {
      key: 'Escape',
    });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
