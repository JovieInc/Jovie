'use client';

import React from 'react';
import type { ProfileNotificationsContextValue } from './types';

export const ProfileNotificationsContext =
  React.createContext<ProfileNotificationsContextValue | null>(null);

export function useProfileNotifications(): ProfileNotificationsContextValue {
  const value = React.useContext(ProfileNotificationsContext);
  if (!value) {
    throw new TypeError(
      'useProfileNotifications must be used within ProfileShell'
    );
  }
  return value;
}
