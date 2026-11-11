import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { buildAsset } from '@/tests/unit/library/library-surface-fixtures';
import { LibraryTakeActions } from './LibraryTakeActions';
import { buildLibraryTakeAssets } from './library-take-assets';

const [take] = buildLibraryTakeAssets(
  [
    {
      takeId: 'take-1',
      takeNumber: 2,
      title: 'Intro',
      kind: 'promo',
      source: 'script',
      durationMs: 9_000,
      kept: false,
      createdAt: '2026-11-11T12:00:00.000Z',
      mediaUrl: '/api/teleprompter/takes/take-1/media',
    },
  ],
  'Tim White'
);

describe('LibraryTakeActions', () => {
  it('links a take to its owner-checked media route', () => {
    render(<LibraryTakeActions asset={take} open />);
    const link = screen.getByRole('link', { name: 'Watch Take' });
    expect(link).toHaveAttribute(
      'href',
      '/api/teleprompter/takes/take-1/media'
    );
    expect(link).not.toHaveAttribute('tabindex');
  });

  it('keeps the link out of the tab order while the drawer closes', () => {
    render(<LibraryTakeActions asset={take} open={false} />);
    expect(screen.getByRole('link', { name: 'Watch Take' })).toHaveAttribute(
      'tabindex',
      '-1'
    );
  });

  it('renders nothing for a release', () => {
    const { container } = render(
      <LibraryTakeActions asset={buildAsset()} open />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
