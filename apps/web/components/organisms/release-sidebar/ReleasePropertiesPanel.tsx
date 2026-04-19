'use client';

import type { CSSProperties } from 'react';
import { DrawerSection } from '@/components/molecules/drawer';
import type { CanvasStatus } from '@/lib/services/canvas/types';
import { ReleaseCreditsSection } from './ReleaseCreditsSection';
import { ReleaseMetadata } from './ReleaseMetadata';
import type { Release } from './types';

const PROPERTIES_PANEL_STYLE = {
  '--drawer-inspector-label-width': '96px',
} as CSSProperties;

interface ReleasePropertiesPanelProps {
  readonly release: Release;
  readonly showCredits?: boolean;
  readonly isEditable: boolean;
  readonly onSaveMetadata?: (
    releaseId: string,
    values: { upc: string | null; label: string | null }
  ) => Promise<void>;
  readonly onSavePrimaryIsrc?: (
    releaseId: string,
    isrc: string | null
  ) => Promise<void>;
  readonly onCanvasStatusChange?: (status: CanvasStatus) => void;
}

export function ReleasePropertiesPanel({
  release,
  showCredits = true,
  isEditable,
  onSaveMetadata,
  onSavePrimaryIsrc,
  onCanvasStatusChange,
}: ReleasePropertiesPanelProps) {
  return (
    <DrawerSection
      title='Properties'
      surface='card'
      collapsible={false}
      testId='release-properties-card'
      contentClassName='p-0'
    >
      <div style={PROPERTIES_PANEL_STYLE}>
        <ReleaseMetadata
          release={release}
          isEditable={isEditable}
          variant='flat'
          onSaveMetadata={onSaveMetadata}
          onSavePrimaryIsrc={onSavePrimaryIsrc}
          onCanvasStatusChange={onCanvasStatusChange}
        />
        {showCredits ? (
          <ReleaseCreditsSection releaseId={release.id} variant='flat' />
        ) : null}
      </div>
    </DrawerSection>
  );
}
