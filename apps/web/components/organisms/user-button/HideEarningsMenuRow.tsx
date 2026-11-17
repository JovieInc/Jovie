import {
  INSET_PANEL_ICON_COLUMN,
  INSET_PANEL_LABEL,
  INSET_PANEL_TRAILING,
  Switch,
} from '@jovie/ui';
import { EyeOff } from 'lucide-react';

export const HIDE_EARNINGS_LABEL = 'Hide Earnings';

/**
 * Accessible name for the menu item that hosts the row. A menu item has no
 * checked state, so the name spells the state out.
 */
export function hideEarningsAccessibleName(hidden: boolean): string {
  return `${HIDE_EARNINGS_LABEL}, ${hidden ? 'On' : 'Off'}`;
}

export interface HideEarningsMenuRowProps {
  /** True when earnings are currently hidden (switch on). */
  readonly hidden: boolean;
}

/**
 * Content of the earnings-visibility row: the label stays put and the switch
 * carries the state. Display only: the hosting menu item is the control, so
 * the switch stays out of the tab order and the accessibility tree.
 */
export function HideEarningsMenuRow({ hidden }: HideEarningsMenuRowProps) {
  return (
    <>
      <span className={INSET_PANEL_ICON_COLUMN}>
        <EyeOff className='h-4 w-4' aria-hidden='true' />
      </span>
      <span className={INSET_PANEL_LABEL}>{HIDE_EARNINGS_LABEL}</span>
      <span className={INSET_PANEL_TRAILING}>
        <Switch
          checked={hidden}
          tabIndex={-1}
          aria-hidden='true'
          className='pointer-events-none'
        />
      </span>
    </>
  );
}
