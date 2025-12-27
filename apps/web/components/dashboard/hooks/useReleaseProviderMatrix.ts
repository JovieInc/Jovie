'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react';
import { toast } from 'sonner';
import {
  resetProviderOverride,
  saveProviderOverride,
  syncFromSpotify,
} from '@/app/app/dashboard/releases/actions';
import { copyToClipboard } from '@/lib/clipboard';
import type { ProviderKey, ReleaseViewModel } from '@/lib/discography/types';
import { getBaseUrl } from '@/lib/utils/platform-detection';

export type DraftState = Partial<Record<ProviderKey, string>>;

export interface ProviderConfig {
  label: string;
  accent: string;
}

export interface ProviderListItem {
  key: ProviderKey;
  label: string;
  accent: string;
  isPrimary: boolean;
}

export interface UseReleaseProviderMatrixProps {
  releases: ReleaseViewModel[];
  providerConfig: Record<ProviderKey, ProviderConfig>;
  primaryProviders: ProviderKey[];
}

export interface UseReleaseProviderMatrixReturn {
  rows: ReleaseViewModel[];
  editingRelease: ReleaseViewModel | null;
  drafts: DraftState;
  isSaving: boolean;
  isSyncing: boolean;
  headerElevated: boolean;
  tableContainerRef: React.RefObject<HTMLDivElement>;
  providerList: ProviderListItem[];
  totalReleases: number;
  totalOverrides: number;
  setDrafts: React.Dispatch<React.SetStateAction<DraftState>>;
  openEditor: (release: ReleaseViewModel) => void;
  closeEditor: () => void;
  handleCopy: (path: string, label: string, testId: string) => Promise<string>;
  handleSave: (provider: ProviderKey) => void;
  handleReset: (provider: ProviderKey) => void;
  handleSync: () => void;
}

export function useReleaseProviderMatrix({
  releases,
  providerConfig,
  primaryProviders,
}: UseReleaseProviderMatrixProps): UseReleaseProviderMatrixReturn {
  const [rows, setRows] = useState<ReleaseViewModel[]>(releases);
  const [editingRelease, setEditingRelease] = useState<ReleaseViewModel | null>(
    null
  );
  const [drafts, setDrafts] = useState<DraftState>({});
  const [isSaving, startSaving] = useTransition();
  const [isSyncing, startSyncing] = useTransition();
  const [headerElevated, setHeaderElevated] = useState(false);
  const tableContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = tableContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      setHeaderElevated(container.scrollTop > 0);
    };

    handleScroll();
    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  const providerList = useMemo(
    () =>
      (Object.keys(providerConfig) as ProviderKey[]).map(key => ({
        key,
        label: providerConfig[key].label,
        accent: providerConfig[key].accent,
        isPrimary: primaryProviders.includes(key),
      })),
    [providerConfig, primaryProviders]
  );

  const openEditor = useCallback((release: ReleaseViewModel) => {
    setEditingRelease(release);
    const nextDrafts: DraftState = {};
    release.providers.forEach(provider => {
      nextDrafts[provider.key] = provider.url ?? '';
    });
    setDrafts(nextDrafts);
  }, []);

  const closeEditor = useCallback(() => {
    setEditingRelease(null);
    setDrafts({});
  }, []);

  const updateRow = useCallback((updated: ReleaseViewModel) => {
    setRows(prev =>
      prev.map(row => (row.id === updated.id ? { ...updated } : row))
    );
    setEditingRelease(current =>
      current && current.id === updated.id ? { ...updated } : current
    );
  }, []);

  const handleCopy = useCallback(
    async (path: string, label: string, testId: string) => {
      const absoluteUrl = `${getBaseUrl()}${path}`;
      const success = await copyToClipboard(absoluteUrl);
      if (success) {
        toast.success(`${label} copied`, { id: testId });
      } else {
        toast.error('Unable to copy link', { id: `${testId}-error` });
      }
      return absoluteUrl;
    },
    []
  );

  const handleSave = useCallback(
    (provider: ProviderKey) => {
      if (!editingRelease) return;
      const url = drafts[provider]?.trim() ?? '';
      if (!url) {
        toast.error('Enter a URL before saving');
        return;
      }

      startSaving(async () => {
        try {
          const updated = await saveProviderOverride({
            profileId: editingRelease.profileId,
            releaseId: editingRelease.id,
            provider,
            url,
          });
          updateRow(updated);
          toast.success('Link updated');
        } catch (error) {
          console.error(error);
          toast.error('Failed to save override');
        }
      });
    },
    [editingRelease, drafts, updateRow]
  );

  const handleReset = useCallback(
    (provider: ProviderKey) => {
      if (!editingRelease) return;

      startSaving(async () => {
        try {
          const updated = await resetProviderOverride({
            profileId: editingRelease.profileId,
            releaseId: editingRelease.id,
            provider,
          });
          updateRow(updated);
          setDrafts(prev => ({
            ...prev,
            [provider]:
              updated.providers.find(item => item.key === provider)?.url ?? '',
          }));
          toast.success('Reverted to detected link');
        } catch (error) {
          console.error(error);
          toast.error('Failed to reset link');
        }
      });
    },
    [editingRelease, updateRow]
  );

  const handleSync = useCallback(() => {
    startSyncing(async () => {
      try {
        const result = await syncFromSpotify();
        if (result.success) {
          toast.success(result.message);
          window.location.reload();
        } else {
          toast.error(result.message);
        }
      } catch (error) {
        console.error(error);
        toast.error('Failed to sync from Spotify');
      }
    });
  }, []);

  const totalReleases = rows.length;
  const totalOverrides = useMemo(
    () =>
      rows.reduce(
        (count, release) =>
          count + release.providers.filter(p => p.source === 'manual').length,
        0
      ),
    [rows]
  );

  return {
    rows,
    editingRelease,
    drafts,
    isSaving,
    isSyncing,
    headerElevated,
    tableContainerRef,
    providerList,
    totalReleases,
    totalOverrides,
    setDrafts,
    openEditor,
    closeEditor,
    handleCopy,
    handleSave,
    handleReset,
    handleSync,
  };
}
