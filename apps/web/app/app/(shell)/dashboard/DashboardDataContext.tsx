'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { UNKNOWN_INBOX_NAVIGATION_AVAILABILITY } from '@/lib/inbox/navigation-availability';
import { UNKNOWN_AVATAR_QUALITY } from '@/lib/profile/avatar-quality';
import type { DashboardData } from './actions';

interface DashboardDataContextValue extends DashboardData {
  readonly updateSelectedProfileSettings?: (
    profileId: string,
    settings: Record<string, unknown>
  ) => void;
}

export const DashboardDataContext =
  createContext<DashboardDataContextValue | null>(null);

const EMPTY_PROFILE_COMPLETION: DashboardData['profileCompletion'] = {
  percentage: 0,
  completedCount: 0,
  totalCount: 0,
  steps: [],
  profileIsLive: false,
};

function normalizeDashboardData(value: DashboardData): DashboardData {
  return {
    ...value,
    avatarQuality: value.avatarQuality ?? UNKNOWN_AVATAR_QUALITY,
    bioLinkActivation: value.bioLinkActivation ?? null,
    inboxNavigation:
      value.inboxNavigation ?? UNKNOWN_INBOX_NAVIGATION_AVAILABILITY,
    profileCompletion: value.profileCompletion ?? EMPTY_PROFILE_COMPLETION,
  };
}

interface DashboardDataProviderProps {
  readonly value: DashboardData;
  readonly children: React.ReactNode;
}

export function DashboardDataProvider({
  value,
  children,
}: Readonly<DashboardDataProviderProps>) {
  const [selectedProfile, setSelectedProfile] = useState(value.selectedProfile);

  useEffect(() => {
    setSelectedProfile(value.selectedProfile);
  }, [value.selectedProfile]);

  const updateSelectedProfileSettings = useCallback(
    (profileId: string, settings: Record<string, unknown>) => {
      setSelectedProfile(current =>
        current?.id === profileId
          ? {
              ...current,
              settings: { ...(current.settings ?? {}), ...settings },
            }
          : current
      );
    },
    []
  );

  const normalizedValue = useMemo(
    () => ({
      ...normalizeDashboardData(value),
      selectedProfile,
      updateSelectedProfileSettings,
    }),
    [selectedProfile, updateSelectedProfileSettings, value]
  );

  return (
    <DashboardDataContext.Provider value={normalizedValue}>
      {children}
    </DashboardDataContext.Provider>
  );
}

export function useDashboardData(): DashboardDataContextValue {
  const context = useContext(DashboardDataContext);
  if (!context) {
    throw new TypeError(
      'useDashboardData must be used within a DashboardDataProvider'
    );
  }
  return context;
}
