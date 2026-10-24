import type { MenuItemConstructorOptions, NavigationHistory } from 'electron';

export const WINDOW_HISTORY_LIMIT = 50;
type WindowHistory = Pick<
  NavigationHistory,
  | 'length'
  | 'getActiveIndex'
  | 'removeEntryAtIndex'
  | 'getAllEntries'
  | 'getEntryAtIndex'
  | 'goToIndex'
>;

/** Keep the current page and the most recent entries, bounded per window. */
export function trimNavigationHistory(history: WindowHistory): void {
  while (history.length() > WINDOW_HISTORY_LIMIT) {
    const index = history.getActiveIndex() === 0 ? 1 : 0;
    if (!history.removeEntryAtIndex(index)) break;
  }
}

/** Native menus never expose query strings or stale navigation indices. */
export function navigationHistoryItems(
  history: WindowHistory
): MenuItemConstructorOptions[] {
  return history
    .getAllEntries()
    .slice(0, WINDOW_HISTORY_LIMIT)
    .map<MenuItemConstructorOptions>((entry, index) => ({
      label:
        entry.title ||
        (entry.url === 'about:blank' ? 'Page' : new URL(entry.url).pathname),
      type: 'checkbox',
      checked: index === history.getActiveIndex(),
      click: () => {
        if (history.getEntryAtIndex(index)?.url === entry.url)
          history.goToIndex(index);
      },
    }))
    .reverse();
}
