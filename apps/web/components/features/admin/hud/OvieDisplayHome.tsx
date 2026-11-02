'use client';

import { OvieHomeCanvas } from './OvieHomeCanvas';

/**
 * Home for the office display. The route is outside the app shell, so the
 * canvas is the whole screen, and pointer events are off. The session behind
 * it can only read; the Home feeds reject every write for it.
 */
export function OvieDisplayHome() {
  return (
    <div className='pointer-events-none'>
      <OvieHomeCanvas />
    </div>
  );
}
