'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { NavItem } from '@/features/dashboard/dashboard-nav/types';

/** Personal navigation preferences hold IDs only; the authorized registry supplies links. */
export function useSidebarPins(
  scope: string | undefined,
  items: readonly NavItem[]
) {
  const key = scope ? `jovie:sidebar:pins:v1:${scope}` : undefined;
  const [saved, setSaved] = useState<{ key: string; ids: string[] }>();
  useEffect(() => {
    if (!key) return;
    let ids: string[] = [];
    try {
      const value: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
      if (Array.isArray(value))
        ids = [
          ...new Set(
            value.filter((id): id is string => typeof id === 'string')
          ),
        ];
    } catch {
      /* In-memory preferences remain available when storage is unavailable. */
    }
    setSaved({ key, ids });
  }, [key]);
  const ids = useMemo(
    () => (saved && saved.key === key ? saved.ids : []),
    [saved, key]
  );
  const pinned = useMemo(
    () =>
      ids.flatMap(id => {
        const item = items.find(item => item.id === id);
        return item ? [item] : [];
      }),
    [ids, items]
  );
  const toggle = useCallback(
    (id: string) => {
      if (!key || !items.some(item => item.id === id)) return;
      const next = ids.includes(id)
        ? ids.filter(value => value !== id)
        : [...ids, id];
      setSaved({ key, ids: next });
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* Keep the preference for this session. */
      }
    },
    [key, ids, items]
  );
  return { pinned, toggle: key ? toggle : undefined };
}
