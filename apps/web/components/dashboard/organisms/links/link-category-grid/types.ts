import type { Modifier } from '@dnd-kit/core';
import type { RefObject } from 'react';
import type { DetectedLink } from '@/lib/utils/platform-detection';

/**
 * Pending preview state for a link being added
 */
export interface PendingPreview {
  link: DetectedLink;
  isDuplicate: boolean;
}

/**
 * Props for the LinkCategoryGrid component
 */
export interface LinkCategoryGridProps<T extends DetectedLink = DetectedLink> {
  /** Array of all links */
  readonly links: T[];

  /** Callback when links are reordered via drag-and-drop */
  readonly onLinksChange: (links: T[]) => void;

  /** Handler for toggling link visibility */
  readonly onToggle: (idx: number) => void;

  /** Handler for removing a link */
  readonly onRemove: (idx: number) => void;

  /** Handler for editing a link */
  readonly onEdit: (idx: number) => void;

  /** ID of the currently open action menu */
  readonly openMenuId: string | null;

  /** Callback when any menu opens/closes */
  readonly onAnyMenuOpen: (id: string | null) => void;

  /** ID of the most recently added link (for highlight animation) */
  readonly lastAddedId: string | null;

  /** Function to build the primary label for a pill */
  readonly buildPillLabel: (link: DetectedLink) => string;

  /** Link currently being added (shows loading state) */
  readonly addingLink: T | null;

  /** Preview of a link about to be added */
  readonly pendingPreview: PendingPreview | null;

  /** Handler for adding the pending preview link */
  readonly onAddPendingPreview: (link: DetectedLink) => void;

  /** Handler for canceling the pending preview */
  readonly onCancelPendingPreview: () => void;

  /** Callback when hint message should be shown (for invalid drag moves) */
  readonly onHint: (message: string | null) => void;

  /** DnD modifiers (optional) */
  readonly modifiers?: Modifier[];

  /** Optional additional CSS classes */
  readonly className?: string;

  /** Optional scroll container ref for virtualization */
  readonly scrollContainerRef?: RefObject<HTMLDivElement | null>;
}
