import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { mockFitLayout } from './fit-layout.test-utils';
import {
  HOME_LOOP_FIXTURE_BUSY_ROWS,
  HOME_LOOP_FIXTURE_ROWS,
  HOME_LOOP_FIXTURE_STAGES,
  HOME_LOOP_FIXTURE_STRIP,
} from './fixtures';
import { HomeLoopKanban, HomeLoopKanbanSkeleton } from './HomeLoopKanban';
import { HomeLoopStageStrip } from './HomeLoopStageStrip';

describe('HomeLoopKanban', () => {
  it('puts each row in its stage lane with counts', () => {
    render(
      <HomeLoopKanban
        stages={HOME_LOOP_FIXTURE_STAGES}
        rows={HOME_LOOP_FIXTURE_ROWS}
      />
    );
    const lanes = screen.getAllByTestId('home-loop-kanban-lane');
    expect(lanes.map(lane => lane.getAttribute('data-stage'))).toEqual([
      ...HOME_LOOP_FIXTURE_STAGES,
    ]);
    const building = screen.getByRole('region', { name: 'Building: 2' });
    expect(
      within(building).getAllByTestId('home-loop-kanban-card')
    ).toHaveLength(2);
    expect(within(building).getByText('Failing')).toBeVisible();
    expect(screen.queryByTestId('home-loop-kanban-more')).toBeNull();
  });

  it('collapses what does not fit a lane into +N more', () => {
    const restore = mockFitLayout('home-loop-kanban-cards', 250);
    try {
      render(
        <HomeLoopKanban
          stages={HOME_LOOP_FIXTURE_STAGES}
          rows={HOME_LOOP_FIXTURE_BUSY_ROWS}
          moreHref='/app/ov/shipping'
        />
      );
      const investigating = screen.getByRole('region', {
        name: 'Investigating: 6',
      });
      const hidden = within(investigating)
        .getAllByTestId('home-loop-kanban-card')
        .filter(card => card.getAttribute('aria-hidden') === 'true');
      expect(hidden).toHaveLength(4);
      const more = within(investigating).getByTestId('home-loop-kanban-more');
      expect(more).toHaveTextContent('+4 more');
      expect(more).toHaveAttribute('href', '/app/ov/shipping');
    } finally {
      restore();
    }
  });

  it('reserves six lane frames while loading', () => {
    const { container } = render(<HomeLoopKanbanSkeleton />);
    expect(container.firstElementChild?.children).toHaveLength(6);
  });
});

describe('HomeLoopStageStrip', () => {
  it('names each span and its tone in text', () => {
    render(
      <HomeLoopStageStrip
        title='Stage Time'
        items={HOME_LOOP_FIXTURE_STRIP}
        coverage='14 of 31 stages measured'
        emptyLabel='Not measured'
      />
    );
    const items = screen.getAllByTestId('home-loop-strip-item');
    expect(items).toHaveLength(HOME_LOOP_FIXTURE_STRIP.length);
    expect(items[2]).toHaveAttribute('data-tone', 'bad');
    expect(screen.getByText('14 of 31 stages measured')).toBeVisible();
  });

  it('says Not measured when nothing is published', () => {
    render(
      <HomeLoopStageStrip
        title='Stage Time'
        items={[]}
        emptyLabel='Not measured'
      />
    );
    expect(screen.getByTestId('home-loop-stage-strip')).toHaveTextContent(
      'Stage TimeNot measured'
    );
  });
});
