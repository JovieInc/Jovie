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
  links: T[];

  /** Callback when links are reordered via drag-and-drop */
  onLinksChange: (links: T[]) => void;

  /** Handler for toggling link visibility */
  onToggle: (idx: number) => void;

  /** Handler for removing a link */
  onRemove: (idx: number) => void;

  /** Handler for editing a link */
  onEdit: (idx: number) => void;

  /** ID of the currently open action menu */
  openMenuId: string | null;

  /** Callback when any menu opens/closes */
  onAnyMenuOpen: (id: string | null) => void;

  /** ID of the most recently added link (for highlight animation) */
  lastAddedId: string | null;

  /** Function to build the primary label for a pill */
  buildPillLabel: (link: DetectedLink) => string;

  /** Link currently being added (shows loading state) */
  addingLink: T | null;

  /** Preview of a link about to be added */
  pendingPreview: PendingPreview | null;

  /** Handler for adding the pending preview link */
  onAddPendingPreview: (link: DetectedLink) => void;

  /** Handler for canceling the pending preview */
  onCancelPendingPreview: () => void;

  /** Callback when hint message should be shown (for invalid drag moves) */
  onHint: (message: string | null) => void;

  /** DnD modifiers (optional) */
  modifiers?: Modifier[];

  /** Optional additional CSS classes */
  className?: string;

  /** Optional scroll container ref for virtualization */
  scrollContainerRef?: RefObject<HTMLDivElement | null>;
}
