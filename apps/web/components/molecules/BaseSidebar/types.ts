/**
 * BaseSidebar Types
 *
 * Shared types for the composable sidebar component.
 */

import type { ReactNode } from 'react';

export type SidebarPosition = 'left' | 'right';

export interface BaseSidebarProps {
  /** Whether the sidebar is open */
  isOpen: boolean;
  /** Callback when sidebar should close */
  onClose?: () => void;
  /** Sidebar position */
  position?: SidebarPosition;
  /** Width in pixels (default: 320) */
  width?: number;
  /** Children to render inside the sidebar */
  children: ReactNode;
  /** Additional class names */
  className?: string;
  /** Aria label for accessibility */
  ariaLabel?: string;
  /** Whether to close on Escape key (default: true) */
  closeOnEscape?: boolean;
  /** Whether to show overlay on mobile (default: true) */
  showOverlay?: boolean;
  /** Test ID for testing */
  testId?: string;
}

export interface BaseSidebarHeaderProps {
  /** Header content */
  children: ReactNode;
  /** Additional class names */
  className?: string;
  /** Show close button (default: true if onClose provided) */
  showCloseButton?: boolean;
  /** Close callback */
  onClose?: () => void;
}

export interface BaseSidebarContentProps {
  /** Content to render */
  children: ReactNode;
  /** Additional class names */
  className?: string;
}

export interface BaseSidebarFooterProps {
  /** Footer content */
  children: ReactNode;
  /** Additional class names */
  className?: string;
}
