'use client';

import { type CSSProperties } from 'react';
import type { EntityKind } from '@/lib/chat/tokens';
import { ENTITY_KIND_ACCENT_VAR } from './entity-accent';

interface EntityMentionSpanProps {
  readonly kind: EntityKind;
  readonly label: string;
}

/**
 * Subdued inline entity mention for assistant transcript copy.
 * Progressive disclosure: tinted label + hairline accent underline at rest;
 * hover/focus detail lives in the wrapping `EntityChipPopover` trigger.
 */
export function EntityMentionSpan({ kind, label }: EntityMentionSpanProps) {
  const accentStyle = {
    '--jovie-entity-accent': `var(${ENTITY_KIND_ACCENT_VAR[kind]})`,
  } as CSSProperties;

  return (
    <span
      className='system-b-entity-mention-span'
      style={accentStyle}
      data-testid='entity-mention-span'
      data-entity-kind={kind}
    >
      {label}
    </span>
  );
}
