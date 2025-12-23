'use client';

import { useSession } from '@clerk/nextjs';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

const STORAGE_PREFIX = 'jovie:session-draft';
const WARNING_OFFSET_MS = 2 * 60 * 1000;
const AUTO_SAVE_INTERVAL_MS = 15_000;

export type SaveReason = 'auto' | 'manual' | 'warning' | 'unload';

export interface DraftSnapshot<T = unknown> {
  key: string;
  data: T;
  savedAt: number;
  pathname: string;
  reason: SaveReason;
}

export interface SessionDraftSource<T = unknown> {
  key: string;
  serialize: () => T | null;
  hydrate?: (data: T) => void;
  isDirty?: () => boolean;
  label?: string;
}

interface LastSaveResult {
  at: number;
  count: number;
  reason: SaveReason;
}

export interface SaveDraftOptions {
  force?: boolean;
  reason?: SaveReason;
  trackState?: boolean;
}

export interface SessionTimeoutContextValue {
  registerDraftSource: <T>(source: SessionDraftSource<T>) => () => void;
  pendingDrafts: Map<string, DraftSnapshot>;
  discardDraft: (key: string) => void;
  warningVisible: boolean;
  countdownMs: number | null;
  extendSession: () => Promise<void>;
  saveDrafts: (options?: SaveDraftOptions) => Promise<number>;
  dismissWarning: () => void;
  isExtending: boolean;
  isSavingDrafts: boolean;
  lastSave: LastSaveResult | null;
  autoSaveError: string | null;
  draftSourceCount: number;
}

export const SessionTimeoutContext =
  createContext<SessionTimeoutContextValue | null>(null);

function buildStorageKey(userId: string, draftKey: string) {
  return `${STORAGE_PREFIX}:${userId}:${draftKey}`;
}

function useLatest<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}

export function useProvideSessionTimeout(): SessionTimeoutContextValue {
  const { session, isLoaded } = useSession();
  const userId = session?.user?.id ?? null;

  const draftSourcesRef = useRef(new Map<string, SessionDraftSource<any>>());
  const warningTimeoutRef = useRef<number | null>(null);
  const countdownIntervalRef = useRef<number | null>(null);
  const autoSaveIntervalRef = useRef<number | null>(null);

  const [draftSourceCount, setDraftSourceCount] = useState(0);
  const [pendingDrafts, setPendingDrafts] = useState<
    Map<string, DraftSnapshot>
  >(() => new Map());
  const [warningVisible, setWarningVisible] = useState(false);
  const [countdownMs, setCountdownMs] = useState<number | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [isExtending, setIsExtending] = useState(false);
  const [isSavingDrafts, setIsSavingDrafts] = useState(false);
  const [autoSaveError, setAutoSaveError] = useState<string | null>(null);
  const [lastSave, setLastSave] = useState<LastSaveResult | null>(null);

  const expireAtIso = session?.expireAt?.toISOString() ?? null;
  useEffect(() => {
    if (!expireAtIso) {
      setExpiresAt(null);
      setWarningVisible(false);
      setCountdownMs(null);
      return;
    }
    setExpiresAt(new Date(expireAtIso).getTime());
  }, [expireAtIso]);

  useEffect(() => {
    if (!userId || typeof window === 'undefined') {
      setPendingDrafts(new Map());
      return;
    }

    try {
      const next = new Map<string, DraftSnapshot>();
      for (let i = 0; i < window.localStorage.length; i += 1) {
        const storageKey = window.localStorage.key(i);
        if (!storageKey?.startsWith(`${STORAGE_PREFIX}:${userId}:`)) continue;
        const raw = window.localStorage.getItem(storageKey);
        if (!raw) continue;
        try {
          const parsed = JSON.parse(raw) as DraftSnapshot;
          if (parsed?.key) {
            next.set(parsed.key, parsed);
          }
        } catch {
          // Ignore malformed entries
        }
      }
      setPendingDrafts(next);
    } catch (error) {
      console.error('Unable to read saved drafts', error);
    }
  }, [userId]);

  useEffect(() => {
    if (warningTimeoutRef.current) {
      window.clearTimeout(warningTimeoutRef.current);
      warningTimeoutRef.current = null;
    }
    if (!expiresAt || !isLoaded || typeof window === 'undefined') {
      return;
    }

    const now = Date.now();
    const msUntilWarning = expiresAt - WARNING_OFFSET_MS - now;
    if (msUntilWarning <= 0) {
      setWarningVisible(true);
      return;
    }

    const id = window.setTimeout(() => {
      setWarningVisible(true);
    }, msUntilWarning);
    warningTimeoutRef.current = id;

    return () => {
      if (warningTimeoutRef.current) {
        window.clearTimeout(warningTimeoutRef.current);
        warningTimeoutRef.current = null;
      }
    };
  }, [expiresAt, isLoaded]);

  useEffect(() => {
    if (countdownIntervalRef.current) {
      window.clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }

    if (!warningVisible || !expiresAt || typeof window === 'undefined') {
      setCountdownMs(null);
      return;
    }

    const updateCountdown = () => {
      setCountdownMs(Math.max(expiresAt - Date.now(), 0));
    };
    updateCountdown();
    const id = window.setInterval(updateCountdown, 1000);
    countdownIntervalRef.current = id;

    return () => {
      if (countdownIntervalRef.current) {
        window.clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
    };
  }, [warningVisible, expiresAt]);

  const persistDrafts = useCallback(
    async ({
      force = false,
      reason = 'auto',
      trackState = false,
    }: SaveDraftOptions = {}) => {
      if (!userId || typeof window === 'undefined') return 0;
      if (!draftSourcesRef.current.size) return 0;

      if (trackState) {
        setIsSavingDrafts(true);
      }

      try {
        const snapshots: DraftSnapshot[] = [];

        draftSourcesRef.current.forEach(source => {
          try {
            if (!force && source.isDirty && !source.isDirty()) {
              return;
            }
            const data = source.serialize();
            if (data == null) return;

            const snapshot: DraftSnapshot = {
              key: source.key,
              data,
              savedAt: Date.now(),
              pathname: window.location.pathname,
              reason,
            };

            window.localStorage.setItem(
              buildStorageKey(userId, source.key),
              JSON.stringify(snapshot)
            );
            snapshots.push(snapshot);
          } catch (error) {
            console.error('Failed to persist draft', error);
            setAutoSaveError(
              'Unable to save drafts locally. Please ensure storage is available.'
            );
          }
        });

        if (snapshots.length > 0) {
          setPendingDrafts(prev => {
            const next = new Map(prev);
            snapshots.forEach(snapshot => {
              next.set(snapshot.key, snapshot);
            });
            return next;
          });
          setLastSave({ at: Date.now(), count: snapshots.length, reason });
          setAutoSaveError(null);
        }

        return snapshots.length;
      } finally {
        if (trackState) {
          setIsSavingDrafts(false);
        }
      }
    },
    [userId]
  );

  useEffect(() => {
    if (!draftSourceCount || typeof window === 'undefined') {
      if (autoSaveIntervalRef.current) {
        window.clearInterval(autoSaveIntervalRef.current);
        autoSaveIntervalRef.current = null;
      }
      return;
    }

    const id = window.setInterval(() => {
      void persistDrafts({ reason: 'auto' });
    }, AUTO_SAVE_INTERVAL_MS);
    autoSaveIntervalRef.current = id;

    return () => {
      if (autoSaveIntervalRef.current) {
        window.clearInterval(autoSaveIntervalRef.current);
        autoSaveIntervalRef.current = null;
      }
    };
  }, [draftSourceCount, persistDrafts]);

  useEffect(() => {
    if (!warningVisible) return;
    void persistDrafts({ force: true, reason: 'warning' });
  }, [warningVisible, persistDrafts]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleBeforeUnload = () => {
      try {
        void persistDrafts({ force: true, reason: 'unload' });
      } catch {
        // Ignore errors during unload
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [persistDrafts]);

  const registerDraftSource = useCallback(
    <T>(source: SessionDraftSource<T>) => {
      draftSourcesRef.current.set(source.key, source);
      setDraftSourceCount(draftSourcesRef.current.size);
      return () => {
        draftSourcesRef.current.delete(source.key);
        setDraftSourceCount(draftSourcesRef.current.size);
      };
    },
    []
  );

  const discardDraft = useCallback(
    (key: string) => {
      if (userId && typeof window !== 'undefined') {
        try {
          window.localStorage.removeItem(buildStorageKey(userId, key));
        } catch {
          // Ignore storage errors
        }
      }

      setPendingDrafts(prev => {
        if (!prev.has(key)) return prev;
        const next = new Map(prev);
        next.delete(key);
        return next;
      });
    },
    [userId]
  );

  const extendSession = useCallback(async () => {
    if (!session) return;
    setIsExtending(true);
    try {
      const updated = await session.touch();
      const nextExpire = updated?.expireAt ?? session.expireAt;
      if (nextExpire) {
        setExpiresAt(nextExpire.getTime());
      }
      setWarningVisible(false);
      setCountdownMs(null);
    } catch (error) {
      console.error('Failed to extend session', error);
      setAutoSaveError(
        'Unable to extend session automatically. Please refresh.'
      );
      throw error;
    } finally {
      setIsExtending(false);
    }
  }, [session]);

  const dismissWarning = useCallback(() => {
    setWarningVisible(false);
  }, []);

  const saveDrafts = useCallback(
    (options?: SaveDraftOptions) =>
      persistDrafts({
        force: options?.force ?? true,
        reason: options?.reason ?? 'manual',
        trackState: options?.trackState ?? true,
      }),
    [persistDrafts]
  );

  return useMemo<SessionTimeoutContextValue>(
    () => ({
      registerDraftSource,
      pendingDrafts,
      discardDraft,
      warningVisible,
      countdownMs,
      extendSession,
      saveDrafts,
      dismissWarning,
      isExtending,
      isSavingDrafts,
      lastSave,
      autoSaveError,
      draftSourceCount,
    }),
    [
      registerDraftSource,
      pendingDrafts,
      discardDraft,
      warningVisible,
      countdownMs,
      extendSession,
      saveDrafts,
      dismissWarning,
      isExtending,
      isSavingDrafts,
      lastSave,
      autoSaveError,
      draftSourceCount,
    ]
  );
}

export function useSessionTimeout(): SessionTimeoutContextValue {
  const context = useContext(SessionTimeoutContext);
  if (!context) {
    throw new Error(
      'useSessionTimeout must be used within SessionTimeoutProvider'
    );
  }
  return context;
}

export interface UseSessionDraftOptions<T> {
  key: string;
  serialize: () => T | null;
  hydrate?: (data: T) => void;
  isDirty?: (() => boolean) | boolean;
}

export interface UseSessionDraftReturn<T> {
  hasPendingDraft: boolean;
  pendingDraft: DraftSnapshot<T> | null;
  restoreDraft: () => void;
  discardDraft: () => void;
  lastSavedAt: number | null;
}

export function useSessionDraft<T>(
  options: UseSessionDraftOptions<T>
): UseSessionDraftReturn<T> {
  const {
    registerDraftSource,
    pendingDrafts,
    discardDraft: discardStoredDraft,
    lastSave,
  } = useSessionTimeout();

  const serializeRef = useLatest(options.serialize);
  const hydrateRef = useLatest(options.hydrate);
  const dirtyRef = useLatest(options.isDirty);

  useEffect(() => {
    const unregister = registerDraftSource({
      key: options.key,
      serialize: () => serializeRef.current?.() ?? null,
      hydrate: hydrateRef.current
        ? (value: T) => {
            const fn = hydrateRef.current;
            if (fn) {
              fn(value);
            }
          }
        : undefined,
      isDirty: dirtyRef.current
        ? () => {
            const current = dirtyRef.current;
            if (typeof current === 'function') {
              return current();
            }
            return Boolean(current);
          }
        : undefined,
    });
    return unregister;
  }, [options.key, registerDraftSource, serializeRef, hydrateRef, dirtyRef]);

  const pendingDraft = useMemo(() => {
    const draft = pendingDrafts.get(options.key) as
      | DraftSnapshot<T>
      | undefined;
    return draft ?? null;
  }, [pendingDrafts, options.key]);

  const restoreDraft = useCallback(() => {
    if (!pendingDraft) return;
    const hydrate = hydrateRef.current;
    if (hydrate) {
      hydrate(pendingDraft.data);
    }
    discardStoredDraft(options.key);
  }, [pendingDraft, hydrateRef, discardStoredDraft, options.key]);

  const discardDraft = useCallback(() => {
    discardStoredDraft(options.key);
  }, [discardStoredDraft, options.key]);

  return {
    hasPendingDraft: Boolean(pendingDraft),
    pendingDraft,
    restoreDraft,
    discardDraft,
    lastSavedAt: lastSave?.at ?? null,
  };
}
