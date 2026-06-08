import { describe, expect, it } from 'vitest';
import {
  distinctTaskTitles,
  taskSearchFromPills,
} from '@/components/features/dashboard/tasks/task-header-search';
import type { FilterPill } from '@/components/shell/pill-search.types';

describe('task-header-search', () => {
  it('collapses title pills into a search query', () => {
    const pills: FilterPill[] = [
      {
        id: 'pill-1',
        field: 'title',
        op: 'is',
        values: ['press', 'release'],
      },
    ];

    expect(taskSearchFromPills(pills)).toBe('press release');
  });

  it('ignores non-title and negated pills', () => {
    const pills: FilterPill[] = [
      {
        id: 'pill-1',
        field: 'status',
        op: 'is',
        values: ['todo'],
      },
      {
        id: 'pill-2',
        field: 'title',
        op: 'is not',
        values: ['draft'],
      },
    ];

    expect(taskSearchFromPills(pills)).toBe('');
  });

  it('collects distinct task titles for suggestions', () => {
    expect(
      distinctTaskTitles([
        { title: 'Press release' },
        { title: 'Press release' },
        { title: '  ' },
        { title: 'Metadata review' },
      ])
    ).toEqual(['Press release', 'Metadata review']);
  });
});
