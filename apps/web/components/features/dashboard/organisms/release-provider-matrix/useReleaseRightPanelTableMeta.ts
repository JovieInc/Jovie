'use client';

import { useEffect, useRef } from 'react';
import type { TrackSidebarData } from '@/components/organisms/release-sidebar';
import { useTableMeta } from '@/contexts/TableMetaContext';
import type { ReleaseViewModel } from '@/lib/discography/types';

export const RELEASE_DETAIL_PANEL_WIDTH = 388;

interface UseReleaseRightPanelTableMetaOptions {
  readonly rows: readonly ReleaseViewModel[];
  readonly isSidebarOpen: boolean;
  readonly editingRelease: ReleaseViewModel | null;
  readonly editingTrack: TrackSidebarData | null;
  readonly closeEditor: () => void;
  readonly closeTrackDrawer: () => void;
  readonly openEditor: (release: ReleaseViewModel) => void;
  readonly rightPanelWidth?: number;
}

export function useReleaseRightPanelTableMeta({
  rows,
  isSidebarOpen,
  editingRelease,
  editingTrack,
  closeEditor,
  closeTrackDrawer,
  openEditor,
  rightPanelWidth = RELEASE_DETAIL_PANEL_WIDTH,
}: UseReleaseRightPanelTableMetaOptions) {
  const { setTableMeta } = useTableMeta();
  const rowsRef = useRef(rows);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  useEffect(() => {
    const toggle = () => {
      if (editingTrack) {
        closeTrackDrawer();
      } else if (editingRelease) {
        closeEditor();
      } else if (rowsRef.current.length > 0) {
        openEditor(rowsRef.current[0]);
      }
    };

    setTableMeta({
      rowCount: rows.length,
      toggle: rows.length > 0 ? toggle : null,
      rightPanelWidth: isSidebarOpen ? rightPanelWidth : 0,
    });
  }, [
    closeEditor,
    closeTrackDrawer,
    editingRelease,
    editingTrack,
    isSidebarOpen,
    openEditor,
    rightPanelWidth,
    rows.length,
    setTableMeta,
  ]);
}
