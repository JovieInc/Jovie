'use client';

import { PanelRight } from 'lucide-react';
import { DashboardHeaderActionButton } from './DashboardHeaderActionButton';

export interface PanelToggleButtonProps {
  readonly isOpen: boolean;
  readonly onToggle: () => void;
  readonly disabled?: boolean;
  readonly ariaLabel?: string;
}

/**
 * Unified panel toggle button following the Linear pattern:
 * hidden when the panel is open (the panel's own close button handles closing).
 */
export function PanelToggleButton({
  isOpen,
  onToggle,
  disabled,
  ariaLabel = 'Toggle panel',
}: PanelToggleButtonProps) {
  if (isOpen) return null;

  return (
    <DashboardHeaderActionButton
      ariaLabel={ariaLabel}
      pressed={false}
      disabled={disabled}
      onClick={onToggle}
      icon={<PanelRight />}
    />
  );
}
