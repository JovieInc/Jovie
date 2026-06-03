import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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
    expect(screen.getByTestId('entity-preview-event-art')).toHaveClass(
      'system-b-entity-preview-artwork',
      'system-b-entity-preview-event-art'
    );
    expect(screen.getByText('JUN')).toHaveClass(
      'system-b-entity-preview-event-month'
    );
    expect(screen.getByText('12')).toHaveClass(
      'system-b-entity-preview-event-day'
    );
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

    expect(screen.getByText('SS')).toHaveClass(
      'system-b-entity-preview-artwork',
      'system-b-entity-preview-placeholder-art'
    );
  });
});
