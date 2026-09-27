'use client';

import { StatusGlyph, type StatusGlyphState } from '@jovie/ui';
import { cn } from '@/lib/utils';
import type { SaveStatus } from '@/types';

export type SaveStatusIndicatorState = 'saving' | 'saved' | 'error';

export interface SaveStatusIndicatorProps {
  readonly state?: SaveStatusIndicatorState;
  readonly status?: Pick<SaveStatus, 'saving' | 'success' | 'error'>;
  readonly className?: string;
}

const STATE_GLYPH: Record<
  SaveStatusIndicatorState,
  { readonly glyph: StatusGlyphState; readonly label: string }
> = {
  saving: { glyph: 'in_progress', label: 'Saving…' },
  saved: { glyph: 'success', label: 'Saved' },
  error: { glyph: 'error', label: 'Save Failed' },
};

function resolveState({ state, status }: SaveStatusIndicatorProps) {
  if (state) return state;
  if (!status) return null;
  if (status.saving) return 'saving';
  if (status.error) return 'error';
  if (status.success) return 'saved';
  return null;
}

/**
 * SaveStatusIndicator — settings save feedback on the canonical `StatusGlyph`
 * (Pen jAcP1, D5). Replaces `SettingsStatusPill`. Always renders its container
 * so Saving… → Saved → idle transitions never shift the surrounding form
 * layout; idle just renders it invisible.
 */
export function SaveStatusIndicator({
  state,
  status,
  className,
}: SaveStatusIndicatorProps) {
  const resolvedState = resolveState({ state, status });
  const spec = resolvedState ? STATE_GLYPH[resolvedState] : null;

  return (
    <div
      className={cn(
        'min-h-4 text-xs',
        !resolvedState && 'invisible',
        className
      )}
      aria-live='polite'
      data-state={resolvedState ?? 'idle'}
    >
      {spec ? (
        <StatusGlyph
          state={spec.glyph}
          label={
            resolvedState === 'error' && status?.error
              ? status.error
              : spec.label
          }
          size='sm'
        />
      ) : null}
    </div>
  );
}
