import type React from 'react';

export function handleActivationKeyDown(
  event: React.KeyboardEvent,
  handler: (event: React.KeyboardEvent) => void
) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    handler(event);
  }
}
