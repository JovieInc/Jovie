// The crawl loads about 40 pages a minute from one IP, which can spend a
// per-IP budget sized for one visitor. These helpers let a page whose request
// got a 429 be judged on a quiet reload instead.

/** @param {string} r a failed request, written as `<status> <path>` */
const isThrottled = r => r.startsWith('429 ');

/** The browser's own console line for a failed load with status 429. */
const isThrottledLine = e => /status of 429\b/.test(e);

/** @param {{ failedRequests?: string[] }} row */
export const wasThrottled = row => (row.failedRequests ?? []).some(isThrottled);

/**
 * Keeps the first load's other failures and takes its 429s from the quiet
 * reload: a 429 that survives the reload is a real finding. The browser's
 * console line for each 429 is judged the same way.
 * @param {{ failedRequests?: string[], throttledRequests?: string[],
 *   consoleErrors?: string[] }} row
 * @param {{ failedRequests?: string[], consoleErrors?: string[] }} again
 */
export function judgeOnQuietReload(row, again) {
  const first = row.failedRequests ?? [];
  row.throttledRequests = first.filter(isThrottled);
  row.failedRequests = first
    .filter(r => !isThrottled(r))
    .concat((again.failedRequests ?? []).filter(isThrottled));
  if (row.consoleErrors)
    row.consoleErrors = row.consoleErrors
      .filter(e => !isThrottledLine(e))
      .concat((again.consoleErrors ?? []).filter(isThrottledLine));
  return row;
}
