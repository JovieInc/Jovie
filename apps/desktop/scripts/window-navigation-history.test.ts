import { describe, expect, it, vi } from 'vitest';
import {
  navigationHistoryItems,
  trimNavigationHistory,
} from '../src/window-navigation-history';

function historyFixture(count: number, active = count - 1) {
  const entries = Array.from({ length: count }, (_, index) => ({
    url: `https://jov.ie/app/chat/${index}?private=value`,
    title: '',
  }));
  const goToIndex = vi.fn();
  const history = {
    length: () => entries.length,
    getActiveIndex: () => active,
    removeEntryAtIndex: vi.fn((index: number) => {
      if (index === active) return false;
      entries.splice(index, 1);
      if (index < active) active--;
      return true;
    }),
    getAllEntries: () => entries,
    getEntryAtIndex: (index: number) => entries[index],
    goToIndex,
  };
  return { history, entries, goToIndex };
}

describe('per-window titlebar history', () => {
  it.each([0, 25, 99])(
    'caps 100 entries at 50 while preserving active entry %i',
    active => {
      const { history, entries } = historyFixture(100, active);
      const current = entries[active];
      trimNavigationHistory(history);
      expect(entries).toHaveLength(50);
      expect(entries[history.getActiveIndex()]).toBe(current);
    }
  );
  it('leaves a short history alone', () => {
    const { history } = historyFixture(3);
    trimNavigationHistory(history);
    expect(history.removeEntryAtIndex).not.toHaveBeenCalled();
  });
  it('stops if Chromium rejects removal', () => {
    const { history } = historyFixture(51);
    history.removeEntryAtIndex.mockReturnValue(false);
    trimNavigationHistory(history);
    expect(history.removeEntryAtIndex).toHaveBeenCalledTimes(1);
  });
  it('uses private-query-free labels, checks current entry and navigates by index', () => {
    const { history, goToIndex } = historyFixture(3);
    const menu = navigationHistoryItems(history);
    expect(menu.map(item => item.label)).toEqual([
      '/app/chat/2',
      '/app/chat/1',
      '/app/chat/0',
    ]);
    expect(menu[0].checked).toBe(true);
    const click = menu[1].click as () => void;
    click();
    expect(goToIndex).toHaveBeenCalledWith(1);
  });
  it('uses page titles and a safe fallback for untitled blank pages', () => {
    const { history, entries } = historyFixture(2);
    entries[0].url = 'about:blank';
    entries[1].title = 'Calendar';
    expect(navigationHistoryItems(history).map(item => item.label)).toEqual([
      'Calendar',
      'Page',
    ]);
  });
  it('does not follow a stale entry after history changes', () => {
    const { history, entries, goToIndex } = historyFixture(3);
    const menu = navigationHistoryItems(history);
    entries.splice(0, 1);
    (menu[1].click as () => void)();
    expect(goToIndex).not.toHaveBeenCalled();
  });
});
