'use client';

import { useState } from 'react';
import { ChatInput } from '@/components/jovie/components/ChatInput';

export interface ThreadComposerProps {
  readonly placeholder: string;
  /**
   * Called with the trimmed message text when the user submits. The
   * composer clears its own internal state immediately on submit — make
   * sure this callback is synchronous (or fire-and-forget). Returning a
   * Promise is allowed but the composer does not await it; a rejected
   * promise becomes an unhandled rejection, so callers should attach
   * their own `.catch` if the side-effect can fail.
   */
  readonly onSubmit?: (text: string) => void;
  /** Forwarded to ChatInput when the surrounding shell is loading data. */
  readonly isLoading?: boolean;
  /** Forwarded to ChatInput while the user's last submit is in flight. */
  readonly isSubmitting?: boolean;
}

/**
 * Thin wrapper around the production `ChatInput` (Variant F surface)
 * that holds local draft state. Rendered inside `ThreadView`'s floating
 * composer slot by default, but exported separately so callers can
 * compose it elsewhere (e.g. onboarding, ad-hoc panels).
 *
 * The composer carries no full-width chrome — only the pill itself is
 * opaque — so the trailing message in the thread fades into it without
 * a hard band.
 */
export function ThreadComposer({
  placeholder,
  onSubmit,
  isLoading = false,
  isSubmitting = false,
}: ThreadComposerProps) {
  const [value, setValue] = useState('');
  return (
    <ChatInput
      value={value}
      onChange={setValue}
      onSubmit={e => {
        e?.preventDefault?.();
        const text = value.trim();
        if (!text) return;
        onSubmit?.(text);
        setValue('');
      }}
      isLoading={isLoading}
      isSubmitting={isSubmitting}
      placeholder={placeholder}
    />
  );
}
