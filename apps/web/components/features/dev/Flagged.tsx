'use client';

import { type ReactNode, useCallback } from 'react';
import { useFeatureFlagOverrides } from '@/lib/feature-flags/client';
import {
  CODE_FLAG_KEYS,
  type CodeFlagName,
  FEATURE_FLAGS,
} from '@/lib/feature-flags/shared';
import { useFlagBadges } from './FlagBadgeContext';

const isE2E = process.env.NEXT_PUBLIC_E2E_MODE === '1';

interface FlaggedProps {
  /** The code flag name (must be a key of FEATURE_FLAGS) */
  readonly name: CodeFlagName;
  readonly children: ReactNode;
}

/**
 * Wraps flagged UI with a subtle visual indicator when dev flag badges are active.
 * Zero DOM overhead when badges are off, in E2E mode, or in production without dev toolbar.
 */
export function Flagged({ name, children }: FlaggedProps) {
  const badgeCtx = useFlagBadges();
  const overrides = useFeatureFlagOverrides();

  const toggleFlag = useCallback(() => {
    if (!overrides) return;
    const overrideKey = CODE_FLAG_KEYS[name];
    if (overrideKey in overrides.overrides) {
      // Currently overridden — toggle the override value
      const current = overrides.overrides[overrideKey];
      overrides.setOverride(overrideKey, !current);
    } else {
      // Not overridden — override to opposite of code default
      overrides.setOverride(overrideKey, !FEATURE_FLAGS[name]);
    }
  }, [overrides, name]);

  // No badges: return children directly (zero DOM overhead)
  if (isE2E || !badgeCtx?.showBadges) {
    return children;
  }

  // Determine current effective value
  const overrideKey = CODE_FLAG_KEYS[name];
  const isOverridden = overrides && overrideKey in overrides.overrides;
  const effectiveValue = isOverridden
    ? overrides.overrides[overrideKey]
    : FEATURE_FLAGS[name];

  const outlineColor = effectiveValue
    ? 'outline-emerald-500/40'
    : 'outline-red-500/40';

  return (
    <div
      className={`relative outline outline-1 outline-dashed ${outlineColor} rounded-[inherit]`}
    >
      <button
        type='button'
        onClick={toggleFlag}
        className={`absolute -top-2.5 -right-1 z-50 px-1.5 py-0.5 rounded-full text-[9px] font-mono leading-none whitespace-nowrap max-w-[140px] truncate cursor-pointer transition-colors ${
          effectiveValue
            ? 'bg-emerald-500/90 text-white hover:bg-emerald-600/90'
            : 'bg-red-500/90 text-white hover:bg-red-600/90'
        }`}
        title={`${name}: ${effectiveValue ? 'ON' : 'OFF'}${isOverridden ? ' (overridden)' : ''} — click to toggle`}
      >
        {name}
      </button>
      {children}
    </div>
  );
}
