import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import {
  assertChatDoorOwnsPack,
  chatDoorFromMode,
  chatModeForDoor,
  composerPlaceholderForChatDoor,
  hrefForChatDoor,
  identityPackForChatDoor,
  resolveChatDoorFromPathname,
  resolveEntitledOvieDoorHref,
  toggleEntitledChatDoor,
} from '@/lib/chat/ovie-door';

describe('Ovie/Jovie talk door (JOV-5239)', () => {
  it('keeps public artist chat on the Jovie door until an entitled toggle', () => {
    expect(resolveChatDoorFromPathname(APP_ROUTES.CHAT)).toBe('jovie');
    expect(resolveChatDoorFromPathname(`${APP_ROUTES.CHAT}/thread-1`)).toBe(
      'jovie'
    );
    expect(resolveChatDoorFromPathname(APP_ROUTES.DASHBOARD)).toBe('jovie');
    expect(chatDoorFromMode(undefined)).toBe('jovie');
    expect(chatDoorFromMode(null)).toBe('jovie');
    expect(chatModeForDoor('jovie')).toBeUndefined();
    expect(identityPackForChatDoor('jovie')).toBe('jovie');
    expect(hrefForChatDoor('jovie')).toBe(APP_ROUTES.CHAT);
  });

  it('maps existing OV chat chrome onto the Ovie pack and composer', () => {
    expect(resolveChatDoorFromPathname(APP_ROUTES.ADMIN_CHAT)).toBe('ovie');
    expect(resolveChatDoorFromPathname(`${APP_ROUTES.ADMIN_CHAT}/x`)).toBe(
      'ovie'
    );
    expect(chatDoorFromMode('ov')).toBe('ovie');
    expect(chatModeForDoor('ovie')).toBe('ov');
    expect(identityPackForChatDoor('ovie')).toBe('ovie');
    expect(hrefForChatDoor('ovie')).toBe(APP_ROUTES.ADMIN_CHAT);
    expect(composerPlaceholderForChatDoor('ovie')).toBe('Ask Ovie...');
    expect(composerPlaceholderForChatDoor('ovie')).not.toMatch(/Jovie/i);
  });

  it('toggles ov <-> jovie for entitled users', () => {
    expect(toggleEntitledChatDoor({ entitled: true, current: 'jovie' })).toBe(
      'ovie'
    );
    expect(toggleEntitledChatDoor({ entitled: true, current: 'ovie' })).toBe(
      'jovie'
    );
    expect(
      resolveEntitledOvieDoorHref({
        entitled: true,
        pathname: APP_ROUTES.CHAT,
      })
    ).toBe(APP_ROUTES.ADMIN_CHAT);
    expect(
      resolveEntitledOvieDoorHref({
        entitled: true,
        pathname: APP_ROUTES.ADMIN_CHAT,
      })
    ).toBe(APP_ROUTES.CHAT);
  });

  it('is a no-op when the user is not entitled', () => {
    expect(
      toggleEntitledChatDoor({ entitled: false, current: 'jovie' })
    ).toBeNull();
    expect(
      toggleEntitledChatDoor({ entitled: false, current: 'ovie' })
    ).toBeNull();
    expect(
      resolveEntitledOvieDoorHref({
        entitled: false,
        pathname: APP_ROUTES.CHAT,
      })
    ).toBeNull();
    expect(
      resolveEntitledOvieDoorHref({
        entitled: false,
        pathname: APP_ROUTES.ADMIN_CHAT,
      })
    ).toBeNull();
  });

  it('refuses OV chrome on the Jovie pack', () => {
    expect(() => assertChatDoorOwnsPack('ovie', 'jovie')).toThrow(
      'OV chrome cannot stay on Jovie pack'
    );
    expect(() => assertChatDoorOwnsPack('jovie', 'ovie')).toThrow(
      'Jovie chrome cannot stay on Ovie pack'
    );
    expect(() => assertChatDoorOwnsPack('ovie', 'ovie')).not.toThrow();
    expect(() => assertChatDoorOwnsPack('jovie', 'jovie')).not.toThrow();
  });
});
