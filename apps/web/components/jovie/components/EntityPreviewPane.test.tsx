import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { EntityRef } from '@/lib/commands/entities';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { fastRender } from '@/tests/utils/fast-render';
import { EntityPreviewPane } from './EntityPreviewPane';

describe('EntityPreviewPane', () => {
  it('uses System B primitives for the event date fallback and stat strip', () => {
    fastRender(
      <EntityPreviewPane
        entity={{
          kind: 'event',
          id: 'event_1',
          label: 'Club Night',
          meta: {
            kind: 'event',
            eventDate: '2026-06-12',
            city: 'Los Angeles',
            capacity: 1200,
            eventType: 'tour',
          },
        }}
      />
    );

    expect(screen.getByTestId('entity-preview-pane')).toHaveClass(
      'system-b-entity-preview-pane'
    );
    expect(screen.getByTestId('entity-preview-media')).toHaveAttribute(
      'data-entity-header-thumbnail-variant',
      'event'
    );
    expect(screen.getByText('JUN')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('1,200')).toHaveClass(
      'system-b-entity-preview-stat-strong'
    );
  });

  it('uses the shared artwork shell for no-thumbnail placeholders', () => {
    fastRender(
      <EntityPreviewPane
        entity={{
          kind: 'release',
          id: 'release_1',
          label: 'Sober Summer',
          meta: {
            kind: 'release',
            releaseType: 'single',
            totalTracks: 1,
          },
        }}
      />
    );

    expect(screen.getByTestId('entity-preview-media')).toHaveAttribute(
      'data-entity-header-thumbnail-variant',
      'artwork'
    );
    expect(
      screen
        .getByTestId('entity-preview-media')
        .querySelector('[data-artwork-fallback]')
    ).toBeInTheDocument();
  });
});

describe('EntityPreviewPane certificate states', () => {
  const longArtist: EntityRef = {
    kind: 'artist',
    id: 'artist_long',
    label: 'The Extended Midnight Drive Sessions Orchestra And Friends',
    meta: {
      kind: 'artist',
      handle: 'extendedmidnightdrivesessionsorchestra',
      profileUrl: 'https://jov.ie/extendedmidnightdrivesessionsorchestra',
      followers: 1_284_000,
      popularity: 72,
      verified: true,
    },
  };

  const states: readonly (readonly [string, EntityRef])[] = [
    [
      'empty metadata',
      { kind: 'track', id: 'track_1', label: 'Untitled Demo' },
    ],
    [
      'partial release metadata',
      {
        kind: 'release',
        id: 'release_1',
        label: 'Sober Summer',
        meta: { kind: 'release', releaseDate: '2026-06-12' },
      },
    ],
    ['long artist', longArtist],
  ];

  it.each(states)('has no axe violations: %s', async (_state, entity) => {
    const { container } = fastRender(<EntityPreviewPane entity={entity} />);
    await expectNoA11yViolations(container);
  });

  it('shows the eyebrow and title without a stat strip when metadata is empty', () => {
    fastRender(
      <EntityPreviewPane
        entity={{ kind: 'track', id: 'track_1', label: 'Untitled Demo' }}
      />
    );
    expect(screen.getByText('Track')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Untitled Demo' })
    ).toBeInTheDocument();
    expect(document.querySelector('.system-b-entity-preview-stats')).toBeNull();
  });

  it('skips missing stats instead of drawing blanks for partial metadata', () => {
    fastRender(
      <EntityPreviewPane
        entity={{
          kind: 'release',
          id: 'release_1',
          label: 'Sober Summer',
          meta: { kind: 'release', releaseDate: '2026-06-12' },
        }}
      />
    );
    const stats = document.querySelectorAll('.system-b-entity-preview-stat');
    expect(stats).toHaveLength(1);
    expect(screen.queryByText(/tracks/)).toBeNull();
    expect(screen.getByText('Release')).toBeInTheDocument();
  });

  it('keeps every long stat and the full title for long content', () => {
    fastRender(<EntityPreviewPane entity={longArtist} />);
    expect(
      screen.getByRole('heading', {
        name: 'The Extended Midnight Drive Sessions Orchestra And Friends',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByText('@extendedmidnightdrivesessionsorchestra')
    ).toBeInTheDocument();
    expect(screen.getByText('1.3M')).toBeInTheDocument();
    expect(screen.getByText('Verified')).toHaveClass(
      'system-b-entity-preview-stat-solid'
    );
  });

  it('renders right-to-left titles and stays axe-clean', async () => {
    const { container } = fastRender(
      <div dir='rtl' lang='ar'>
        <EntityPreviewPane
          entity={{
            kind: 'release',
            id: 'release_rtl',
            label: 'ليلة في القاهرة',
            meta: { kind: 'release', releaseType: 'album', totalTracks: 12 },
          }}
        />
      </div>
    );
    expect(
      screen.getByRole('heading', { name: 'ليلة في القاهرة' })
    ).toBeInTheDocument();
    expect(screen.getByText('Release · Album')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
