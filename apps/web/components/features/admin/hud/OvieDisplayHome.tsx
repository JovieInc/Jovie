'use client';

import { OvieHomeCanvas } from './OvieHomeCanvas';

/**
 * Home for the office display: always Full Screen, no toggle, no input. The
 * session behind it can only read; the Home feeds reject every write for it.
 */
export function OvieDisplayHome() {
  return (
    <div className='pointer-events-none'>
      <OvieHomeCanvas display />
    </div>
  );
}
