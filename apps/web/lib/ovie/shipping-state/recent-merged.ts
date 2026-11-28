import type { DeliveryMergedPullRequest } from './contract';
import { parseTimestamp, sanitizeOpaqueIdentifier } from './envelope';
import { isRecord } from './sources';

/** Merged PRs from the org search, newest first; malformed nodes drop. */
export function recentMerged(
  data: Record<string, unknown>
): DeliveryMergedPullRequest[] {
  const search = data.org;
  if (!isRecord(search) || !Array.isArray(search.nodes)) return [];
  return search.nodes
    .flatMap(node => {
      if (!isRecord(node) || !isRecord(node.repository)) return [];
      const mergedAt = parseTimestamp(node.mergedAt);
      const url = typeof node.url === 'string' ? node.url : '';
      const title =
        typeof node.title === 'string'
          ? node.title.replace(/\s+/g, ' ').trim().slice(0, 200)
          : '';
      const repo = sanitizeOpaqueIdentifier(
        String(node.repository.name ?? ''),
        100
      );
      if (
        !mergedAt ||
        !title ||
        !repo ||
        !url.startsWith('https://github.com/') ||
        !Number.isSafeInteger(node.number) ||
        Number(node.number) <= 0
      )
        return [];
      return [{ repo, number: Number(node.number), title, url, mergedAt }];
    })
    .sort((a, b) => Date.parse(b.mergedAt) - Date.parse(a.mergedAt))
    .slice(0, 12);
}
