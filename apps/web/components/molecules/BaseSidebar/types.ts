/**
 * BaseSidebar Types
 *
 * Shared types for the composable sidebar component.
 */

import type { ReactNode } from 'react';

export type SidebarPosition = 'left' | 'right';

export interface BaseSidebarProps {
  /** Whether the sidebar is open */
  readonly isOpen: boolean;
  /** Callback when sidebar should close */
  readonly onClose?: () => void;
  /** Sidebar position */
  readonly position?: SidebarPosition;
  /** Width in pixels (default: 320) */
  readonly width?: number;
  /** Children to render inside the sidebar */
  readonly children: ReactNode;
  /** Additional class names */
  readonly className?: string;
  /** Aria label for accessibility */
  readonly ariaLabel?: string;
  /** Whether to close on Escape key (default: true) */
  readonly closeOnEscape?: boolean;
  /** Whether to show overlay on mobile (default: true) */
  readonly showOverlay?: boolean;
  /** Test ID for testing */
  readonly testId?: string;
}

export interface BaseSidebarHeaderProps {
  /** Header content */
  readonly children: ReactNode;
  /** Additional class names */
  readonly className?: string;
  /** Show close button (default: true if onClose provided) */
  readonly showCloseButton?: boolean;
  /** Close callback */
  readonly onClose?: () => void;
}

export interface BaseSidebarContentProps {
  /** Content to render */
  readonly children: ReactNode;
  /** Additional class names */
  readonly className?: string;
}

export interface BaseSidebarFooterProps {
  /** Footer content */
  readonly children: ReactNode;
  /** Additional class names */
  readonly className?: string;
}
