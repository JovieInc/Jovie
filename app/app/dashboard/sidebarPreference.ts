export const SIDEBAR_STORAGE_KEY = 'dashboard.sidebarCollapsed';

export type SidebarPreference = {
  open: boolean;
  hasStoredPreference: boolean;
};

const storageValueFromOpen = (open: boolean): '0' | '1' => (open ? '0' : '1');

export function readSidebarPreference(
  serverSidebarOpen: boolean
): SidebarPreference {
  if (typeof window === 'undefined') {
    return { open: serverSidebarOpen, hasStoredPreference: false };
  }

  try {
    const stored = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);

    if (stored === '0') {
      return { open: true, hasStoredPreference: true };
    }

    if (stored === '1') {
      return { open: false, hasStoredPreference: true };
    }

    return { open: serverSidebarOpen, hasStoredPreference: false };
  } catch {
    return { open: serverSidebarOpen, hasStoredPreference: false };
  }
}

export function persistSidebarPreference(open: boolean): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(
      SIDEBAR_STORAGE_KEY,
      storageValueFromOpen(open)
    );
  } catch {
    // ignore storage errors
  }
}
