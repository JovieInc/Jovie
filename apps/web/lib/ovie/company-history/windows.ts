import { COMPANY_HISTORY_WINDOWS, type CompanyHistoryWindow } from './contract';

const ALLOWED = new Set<number>(COMPANY_HISTORY_WINDOWS);

/**
 * `?days=7,30` -> [7, 30]. Unknown, duplicate or malformed values are
 * dropped; nothing valid falls back to the default 7 and 30.
 */
export function parseHistoryWindows(
  raw: string | null,
  fallback: readonly CompanyHistoryWindow[] = [7, 30]
): CompanyHistoryWindow[] {
  const parsed = (raw ?? '')
    .split(',')
    .map(part => Number(part.trim()))
    .filter((days): days is CompanyHistoryWindow => ALLOWED.has(days));
  const unique = [...new Set(parsed)];
  return unique.length > 0 ? unique : [...fallback];
}
