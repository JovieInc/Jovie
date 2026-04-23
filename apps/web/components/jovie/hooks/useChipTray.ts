'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  type EntityMentionToken,
  type SkillToken,
  serializeEntity,
  serializeSkill,
} from '@/lib/chat/tokens';

// Re-export so consumers can import from one place.
export type {
  ChatToken,
  EntityMentionToken,
  SkillToken,
} from '@/lib/chat/tokens';

/**
 * A chip in the input tray — either a skill invocation or an entity mention.
 * The tray is an ordered prefix that gets serialized as tokens and prepended
 * to the textarea's free-text content on submit.
 */
type Base = { readonly uid: string };
export type TrayChip = (SkillToken | EntityMentionToken) & Base;

export interface UseChipTrayResult {
  readonly chips: readonly TrayChip[];
  readonly addSkill: (id: string) => void;
  readonly addEntity: (mention: Omit<EntityMentionToken, 'type'>) => void;
  readonly removeAt: (index: number) => void;
  readonly removeLast: () => void;
  readonly clear: () => void;
  readonly serialized: string;
}

function serializeChip(chip: TrayChip): string {
  return chip.type === 'skill'
    ? serializeSkill(chip.id)
    : serializeEntity(chip);
}

/**
 * State + helpers for the ChatInput chip tray.
 *
 * The tray is linear: chips are appended in order and only removable from the
 * end (via Backspace on empty textarea) or at a specific index (via the chip's
 * close affordance, if any). This matches how Linear and similar tools model
 * inline tokens — simple, predictable, no interleaving.
 */
function freshUid(): string {
  if (globalThis.crypto !== undefined && 'randomUUID' in globalThis.crypto) {
    return globalThis.crypto.randomUUID();
  }
  return `chip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function useChipTray(): UseChipTrayResult {
  const [chips, setChips] = useState<TrayChip[]>([]);

  const addSkill = useCallback((id: string) => {
    setChips(prev => [...prev, { type: 'skill', id, uid: freshUid() }]);
  }, []);

  const addEntity = useCallback((mention: Omit<EntityMentionToken, 'type'>) => {
    setChips(prev => [
      ...prev,
      { type: 'entity', ...mention, uid: freshUid() },
    ]);
  }, []);

  const removeAt = useCallback((index: number) => {
    setChips(prev => prev.filter((_, i) => i !== index));
  }, []);

  const removeLast = useCallback(() => {
    setChips(prev => (prev.length === 0 ? prev : prev.slice(0, -1)));
  }, []);

  const clear = useCallback(() => setChips([]), []);

  const serialized = useMemo(() => chips.map(serializeChip).join(' '), [chips]);

  return {
    chips,
    addSkill,
    addEntity,
    removeAt,
    removeLast,
    clear,
    serialized,
  };
}

/** Prepend tray-serialized tokens onto free text for submission. */
export function composeMessage(
  chips: readonly TrayChip[],
  text: string
): string {
  if (chips.length === 0) return text;
  const prefix = chips.map(serializeChip).join(' ');
  const trimmed = text.trim();
  return trimmed ? `${prefix} ${trimmed}` : prefix;
}

/** Type guard exported for consumers. */
export function isEntityChip(
  chip: TrayChip
): chip is Extract<TrayChip, { type: 'entity' }> {
  return chip.type === 'entity';
}

/** Exported for tests — keeps the serializer single-sourced. */
export { serializeChip };
