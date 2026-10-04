import { describe, expect, it } from 'vitest';
import {
  applyListAction,
  createList,
  type ListAction,
  type OvList,
} from './model';
import {
  BUILT_IN_SMART_VIEWS,
  type SmartView,
  smartViewCount,
  visibleSidebarSmartViews,
} from './smart-views';

const NOW = '2026-10-04T03:00:00.000Z';

function list(id: string, name: string, ...actions: ListAction[]): OvList {
  return actions.reduce(
    (acc, action) => applyListAction(acc, action, NOW),
    createList({ id, name, now: NOW })
  );
}

function view(id: string): SmartView {
  const found = BUILT_IN_SMART_VIEWS.find(v => v.id === id);
  if (!found) throw new Error(id);
  return found;
}

describe('ovie smart views', () => {
  const collab = list(
    'collab',
    'Collab list',
    { type: 'add', creatorId: 'a' },
    { type: 'rate', creatorId: 'a', rating: 5 },
    { type: 'favorite', creatorId: 'a', favorite: true },
    { type: 'add', creatorId: 'b' },
    { type: 'swipe', creatorId: 'c', direction: 'left' },
    { type: 'suggest', suggestions: [{ creatorId: 'd', reasons: ['x'] }] }
  );
  const press = list(
    'press',
    'Press',
    { type: 'add', creatorId: 'a' },
    { type: 'favorite', creatorId: 'a', favorite: true },
    { type: 'add', creatorId: 'e' },
    { type: 'rate', creatorId: 'e', rating: 3 }
  );

  it('counts distinct creators across lists', () => {
    // "a" is a favorite on both lists but is one creator.
    expect(smartViewCount(view('favorites'), [collab, press])).toBe(1);
    expect(smartViewCount(view('top-rated'), [collab, press])).toBe(1);
    expect(smartViewCount(view('unrated'), [collab, press])).toBe(2);
    expect(smartViewCount(view('suggested'), [collab, press])).toBe(1);
  });

  it('excludes passed creators from member views', () => {
    expect(smartViewCount(view('unrated'), [collab])).toBe(1);
  });

  it('scopes a saved filter to one list', () => {
    const pressUnrated: SmartView = {
      id: 'press-unrated',
      name: 'Press: unrated',
      filter: { listId: 'press', states: ['member'], unrated: true },
      pinned: true,
      builtIn: false,
    };
    expect(smartViewCount(pressUnrated, [collab, press])).toBe(1);
  });

  it('auto-hides empty and unpinned views in the sidebar', () => {
    const unpinned: SmartView = { ...view('unrated'), pinned: false };
    const visible = visibleSidebarSmartViews(
      [view('suggested'), view('favorites'), view('top-rated'), unpinned],
      [press]
    );
    expect(visible).toEqual([{ id: 'favorites', name: 'Favorites', count: 1 }]);
    expect(visibleSidebarSmartViews(BUILT_IN_SMART_VIEWS, [])).toEqual([]);
  });
});
