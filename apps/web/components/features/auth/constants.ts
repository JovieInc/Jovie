import type { TouchEvent } from 'react';

export const AUTH_FORM_MAX_WIDTH_CLASS = 'auth-form-max-width' as const;

/** Cancel browser touch adjustment when the original point belongs elsewhere. */
export function preserveAuthTouchOwnership(event: TouchEvent<HTMLElement>) {
  const touch = event.changedTouches[0];
  const owner =
    event.target instanceof Element ? event.target.closest('button,a') : null;
  const pointOwner =
    touch &&
    document
      .elementFromPoint(touch.clientX, touch.clientY)
      ?.closest('button,a');
  if (owner && touch && owner !== pointOwner) event.preventDefault();
}
