import type { FilterPill } from '@/components/shell/pill-search.types';

/** Collapse title pills into the server-side task search query string. */
export function taskSearchFromPills(pills: readonly FilterPill[]): string {
  return pills
    .filter(pill => pill.field === 'title' && pill.op === 'is')
    .flatMap(pill => pill.values)
    .join(' ')
    .trim();
}

export function distinctTaskTitles(
  tasks: ReadonlyArray<{ readonly title: string }>
): string[] {
  const seen = new Set<string>();
  for (const task of tasks) {
    const title = task.title.trim();
    if (!title) continue;
    seen.add(title);
    if (seen.size >= 200) break;
  }
  return [...seen];
}
