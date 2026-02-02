'use client';

import type { KeyboardEvent } from 'react';
import { useId, useMemo, useRef, useState } from 'react';
import type { PillarConfig, PillarId, UsePillarTabsReturn } from './types';

interface UsePillarTabsOptions {
  pillars: readonly PillarConfig[];
}

export function usePillarTabs({
  pillars,
}: UsePillarTabsOptions): UsePillarTabsReturn {
  const tabsBaseId = useId();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [activePillarId, setActivePillarId] = useState<PillarId>(
    pillars[0]?.id ?? 'streams'
  );

  const active = useMemo<PillarConfig | undefined>(() => {
    return pillars.find(p => p.id === activePillarId) ?? pillars[0];
  }, [activePillarId, pillars]);

  const activePillarIndex = useMemo<number>(() => {
    const index = pillars.findIndex(pillar => pillar.id === activePillarId);
    return Math.max(0, index);
  }, [activePillarId, pillars]);

  const getTabId = (pillarId: PillarId): string =>
    `${tabsBaseId}-tab-${pillarId}`;

  const getPanelId = (pillarId: PillarId): string =>
    `${tabsBaseId}-panel-${pillarId}`;

  const focusTabByIndex = (targetIndex: number) => {
    if (!pillars.length) {
      return;
    }

    const normalizedIndex = (targetIndex + pillars.length) % pillars.length;
    const targetPillar = pillars[normalizedIndex];

    if (!targetPillar) {
      return;
    }

    setActivePillarId(targetPillar.id);
    tabRefs.current[normalizedIndex]?.focus();
  };

  const handleTabKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    currentIndex: number
  ) => {
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault();
        focusTabByIndex(currentIndex + 1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault();
        focusTabByIndex(currentIndex - 1);
        break;
      case 'Home':
        event.preventDefault();
        focusTabByIndex(0);
        break;
      case 'End':
        event.preventDefault();
        focusTabByIndex(pillars.length - 1);
        break;
      default:
        break;
    }
  };

  return {
    activePillarId,
    setActivePillarId,
    active,
    activePillarIndex,
    tabRefs,
    getTabId,
    getPanelId,
    handleTabKeyDown,
  };
}
