import { describe, expect, it } from 'vitest';
import {
  chatModeForFounderDoor,
  FOUNDER_DOOR_STORAGE_KEY,
  founderDoorForChatMode,
  isFounderDoorToggleEvent,
  parseFounderDoor,
  readStoredFounderDoor,
  toggleFounderDoor,
  writeStoredFounderDoor,
} from './founder-door';

function keyEvent(
  init: Partial<KeyboardEvent> & {
    readonly key?: string;
    readonly code?: string;
  }
): KeyboardEvent {
  return {
    isComposing: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    ctrlKey: false,
    key: 'o',
    code: 'KeyO',
    ...init,
  } as KeyboardEvent;
}

describe('founder-door helpers (JOV-5239)', () => {
  it('treats anything other than ovie as the Jovie door', () => {
    expect(parseFounderDoor('ovie')).toBe('ovie');
    expect(parseFounderDoor('jovie')).toBe('jovie');
    expect(parseFounderDoor(null)).toBe('jovie');
    expect(parseFounderDoor('OV')).toBe('jovie');
  });

  it('maps the door onto existing ov-mode without a second chatMode', () => {
    expect(chatModeForFounderDoor('ovie')).toBe('ov');
    expect(chatModeForFounderDoor('jovie')).toBeUndefined();
    expect(founderDoorForChatMode('ov')).toBe('ovie');
    expect(founderDoorForChatMode(null)).toBe('jovie');
  });

  it('toggles jovie ↔ ovie', () => {
    expect(toggleFounderDoor('jovie')).toBe('ovie');
    expect(toggleFounderDoor('ovie')).toBe('jovie');
  });

  it('persists only the explicit door value', () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
    };

    expect(readStoredFounderDoor(storage)).toBe('jovie');
    writeStoredFounderDoor(storage, 'ovie');
    expect(store.get(FOUNDER_DOOR_STORAGE_KEY)).toBe('ovie');
    expect(readStoredFounderDoor(storage)).toBe('ovie');
  });

  it('matches Cmd+O / Ctrl+O and ignores other modifiers', () => {
    expect(isFounderDoorToggleEvent(keyEvent({ metaKey: true }))).toBe(true);
    expect(isFounderDoorToggleEvent(keyEvent({ ctrlKey: true }))).toBe(true);
    expect(
      isFounderDoorToggleEvent(keyEvent({ metaKey: true, shiftKey: true }))
    ).toBe(false);
    expect(isFounderDoorToggleEvent(keyEvent({ key: 'o' }))).toBe(false);
    expect(
      isFounderDoorToggleEvent(keyEvent({ metaKey: true, ctrlKey: true }))
    ).toBe(false);
  });
});
