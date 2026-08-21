/**
 * Entitled founder-door helpers (JOV-5239).
 *
 * Client-safe: no Node fs, no server-only identity pack loader.
 * The selected door maps onto existing ov-mode (`chatMode: 'ov'`) and the
 * Ovie/Jovie identity packs. Public `/app/chat` stays Jovie unless an
 * entitled user has explicitly toggled to Ovie.
 */

export type FounderDoorId = 'jovie' | 'ovie';

export const FOUNDER_DOOR_STORAGE_KEY = 'jovie:founder-door';

export function parseFounderDoor(value: unknown): FounderDoorId {
  return value === 'ovie' ? 'ovie' : 'jovie';
}

export function chatModeForFounderDoor(door: FounderDoorId): 'ov' | undefined {
  return door === 'ovie' ? 'ov' : undefined;
}

export function founderDoorForChatMode(
  chatMode: 'ov' | null | undefined
): FounderDoorId {
  return chatMode === 'ov' ? 'ovie' : 'jovie';
}

export function toggleFounderDoor(door: FounderDoorId): FounderDoorId {
  return door === 'ovie' ? 'jovie' : 'ovie';
}

export function readStoredFounderDoor(
  storage: Pick<Storage, 'getItem'> | null | undefined
): FounderDoorId {
  if (!storage) return 'jovie';
  try {
    return parseFounderDoor(storage.getItem(FOUNDER_DOOR_STORAGE_KEY));
  } catch {
    return 'jovie';
  }
}

export function writeStoredFounderDoor(
  storage: Pick<Storage, 'setItem'> | null | undefined,
  door: FounderDoorId
): void {
  if (!storage) return;
  try {
    storage.setItem(FOUNDER_DOOR_STORAGE_KEY, door);
  } catch {
    // sessionStorage may be unavailable (private browsing, restricted contexts)
  }
}

export function isFounderDoorToggleEvent(event: KeyboardEvent): boolean {
  if (event.isComposing) return false;
  if (event.altKey || event.shiftKey) return false;
  if (!(event.metaKey || event.ctrlKey)) return false;
  if (event.metaKey && event.ctrlKey) return false;
  return event.code === 'KeyO' || event.key.toLowerCase() === 'o';
}
