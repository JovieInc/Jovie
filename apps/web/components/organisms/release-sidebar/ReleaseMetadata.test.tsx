import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ReleaseMetadata } from './ReleaseMetadata';
import type { Release } from './types';

const release = {
  id: 'rel_1',
  title: 'Midnight Drive',
  releaseType: 'single',
  releaseDate: '2026-11-14',
  totalTracks: 1,
  totalDurationMs: 214000,
  isExplicit: true,
  upc: '888880123456',
  label: 'Independent',
  genres: ['pop', 'electronic'],
  spotifyPopularity: 42,
  canvasStatus: 'uploaded',
} as unknown as Release;

describe('ReleaseMetadata', () => {
  it('shows tokenized status badges, genres and an explicit marker with no axe violations', async () => {
    const { container } = render(<ReleaseMetadata release={release} />);

    expect(screen.getByText('Has Video').className).toContain(
      'bg-success-subtle'
    );
    expect(screen.getByText('pop')).toBeInTheDocument();
    expect(screen.getByText('E').className).toContain('text-error-text');
    expect(container.innerHTML).not.toMatch(/emerald|sky-500|red-500/);
    await expectNoA11yViolations(container);
  });

  it('changes the canvas status from the menu when editable', async () => {
    const user = userEvent.setup();
    const onCanvasStatusChange = vi.fn();
    render(
      <ReleaseMetadata
        release={release}
        isEditable
        onSaveMetadata={vi.fn().mockResolvedValue(undefined)}
        onCanvasStatusChange={onCanvasStatusChange}
      />
    );

    await user.click(screen.getByRole('button', { name: /Has Video/ }));
    await user.click(await screen.findByRole('menuitem', { name: /No Video/ }));
    expect(onCanvasStatusChange).toHaveBeenCalledWith('not_set');
  });

  it('renders a bare release without genres and has no axe violations', async () => {
    const { container } = render(
      <ReleaseMetadata
        release={
          {
            id: 'rel_2',
            title: 'Untitled',
            releaseType: 'single',
            totalTracks: 1,
            isExplicit: false,
          } as unknown as Release
        }
      />
    );

    expect(screen.queryByText('Genres')).toBeNull();
    await expectNoA11yViolations(container);
  });
});
