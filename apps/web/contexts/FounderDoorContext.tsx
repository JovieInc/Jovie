'use client';

/**
 * Entitled founder-door state (JOV-5239). Public `/app/chat` stays Jovie
 * unless an entitled user has explicitly toggled to Ovie. Missing provider
 * fails closed to Jovie so customer surfaces never inherit Ovie chrome.
 */

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { DashboardDataContext } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import {
  chatModeForFounderDoor,
  type FounderDoorId,
  readStoredFounderDoor,
  toggleFounderDoor,
  writeStoredFounderDoor,
} from '@/lib/ovie/founder-door';

export type FounderDoorContextValue = {
  readonly canUse: boolean;
  readonly door: FounderDoorId;
  readonly chatMode: 'ov' | undefined;
  readonly toggle: () => void;
};

const CLOSED_DOOR: FounderDoorContextValue = {
  canUse: false,
  door: 'jovie',
  chatMode: undefined,
  toggle: () => {},
};

const FounderDoorContext = createContext<FounderDoorContextValue | null>(null);

export function FounderDoorProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const dashboardData = useContext(DashboardDataContext);
  const canUse = dashboardData?.isAdmin === true;
  const [door, setDoor] = useState<FounderDoorId>('jovie');

  useEffect(() => {
    if (!canUse) {
      setDoor('jovie');
      return;
    }
    setDoor(readStoredFounderDoor(globalThis.sessionStorage));
  }, [canUse]);
  const resolvedDoor = canUse ? door : 'jovie';

  const toggle = useCallback(() => {
    if (!canUse) return;
    setDoor(current => {
      const next = toggleFounderDoor(current);
      try {
        writeStoredFounderDoor(globalThis.sessionStorage, next);
      } catch {
        // sessionStorage may be unavailable
      }
      return next;
    });
  }, [canUse]);

  const value = useMemo<FounderDoorContextValue>(
    () => ({
      canUse,
      door: resolvedDoor,
      chatMode: chatModeForFounderDoor(resolvedDoor),
      toggle,
    }),
    [canUse, resolvedDoor, toggle]
  );

  return (
    <FounderDoorContext.Provider value={value}>
      {children}
    </FounderDoorContext.Provider>
  );
}

export function useFounderDoor(): FounderDoorContextValue {
  return useContext(FounderDoorContext) ?? CLOSED_DOOR;
}
