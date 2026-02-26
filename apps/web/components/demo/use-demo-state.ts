'use client';

import { useMemo, useState } from 'react';
import { DEMO_RELEASES } from './demo-fixtures';
import type {
  DemoFilters,
  DemoRelease,
  DemoTab,
  ReleaseStatus,
} from './demo-types';

export function useDemoState() {
  const [activeTab, setActiveTab] = useState<DemoTab>('releases');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [filters, setFilters] = useState<DemoFilters>({
    status: [],
    search: '',
  });

  // Derived: filtered releases
  const filteredReleases = useMemo(() => {
    let result = DEMO_RELEASES;

    if (filters.status.length > 0) {
      result = result.filter(r => filters.status.includes(r.status));
    }

    if (filters.search.trim()) {
      const q = filters.search.toLowerCase();
      result = result.filter(
        r =>
          r.title.toLowerCase().includes(q) ||
          r.artist.toLowerCase().includes(q)
      );
    }

    return result;
  }, [filters]);

  // Derived: selected release
  const selectedRelease = useMemo(
    () => DEMO_RELEASES.find(r => r.id === selectedItemId) ?? null,
    [selectedItemId]
  );

  // Derived: group releases by status for list rendering
  const groupedReleases = useMemo(() => {
    const order: ReleaseStatus[] = [
      'syncing',
      'scheduled',
      'live',
      'draft',
      'archived',
    ];
    const groups: { status: ReleaseStatus; releases: DemoRelease[] }[] = [];

    for (const status of order) {
      const releases = filteredReleases.filter(r => r.status === status);
      if (releases.length > 0) {
        groups.push({ status, releases });
      }
    }

    return groups;
  }, [filteredReleases]);

  // Switch tab → clear selection
  const switchTab = (tab: DemoTab) => {
    setActiveTab(tab);
    setSelectedItemId(null);
  };

  return {
    activeTab,
    switchTab,
    selectedItemId,
    setSelectedItemId,
    selectedRelease,
    filters,
    setFilters,
    filteredReleases,
    groupedReleases,
  };
}
