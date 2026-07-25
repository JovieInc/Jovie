export const OPEN_HEADER_SEARCH_EVENT = 'jovie:open-header-search';

export function openHeaderSearch(target: EventTarget = globalThis): void {
  target.dispatchEvent(new Event(OPEN_HEADER_SEARCH_EVENT));
}
