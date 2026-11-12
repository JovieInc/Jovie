// Loading and empty menus still own one item (APG Menu): a disabled row that
// arrow keys skip, holding the polite status that announces the state.
// Extracted from common-dropdown-renderer.tsx to keep that file inside its
// size-500 budget.

import { Loader2 } from 'lucide-react';
import {
  MENU_EMPTY_STATE_BASE,
  MENU_LOADING_STATE_BASE,
} from '../lib/dropdown-styles';

export function LoadingState() {
  return (
    <div
      role='menuitem'
      aria-disabled='true'
      data-disabled=''
      tabIndex={-1}
      data-slot='common-dropdown-loading'
      className={MENU_LOADING_STATE_BASE}
    >
      <Loader2
        aria-hidden='true'
        className='h-4 w-4 animate-spin motion-reduce:animate-none'
      />
      <span role='status' aria-live='polite' className='sr-only'>
        Loading menu items
      </span>
    </div>
  );
}

export function EmptyState({ message }: { readonly message: string }) {
  return (
    <div
      role='menuitem'
      aria-disabled='true'
      data-disabled=''
      tabIndex={-1}
      data-slot='common-dropdown-empty'
      className={MENU_EMPTY_STATE_BASE}
    >
      <span role='status' aria-live='polite'>
        {message}
      </span>
    </div>
  );
}
