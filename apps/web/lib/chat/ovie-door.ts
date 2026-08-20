/**
 * Entitled Ovie/Jovie talk-door (JOV-5239).
 *
 * The selected door owns chatMode, Eve identity pack, composer copy, and
 * tools. A sidebar label is not a door. Public `/app/chat` stays Jovie unless
 * an entitled user explicitly toggles to the existing OV chat route.
 */

import { APP_ROUTES } from '@/constants/routes';

export type ChatDoorId = 'jovie' | 'ovie';

export const CHAT_DOOR_COMPOSER_PLACEHOLDER = {
  jovie: 'Ask Jovie to plan your next release...',
  ovie: 'Ask Ovie...',
} as const;

export function chatDoorFromMode(
  chatMode: 'ov' | null | undefined
): ChatDoorId {
  return chatMode === 'ov' ? 'ovie' : 'jovie';
}

export function chatModeForDoor(door: ChatDoorId): 'ov' | undefined {
  return door === 'ovie' ? 'ov' : undefined;
}

export function identityPackForChatDoor(door: ChatDoorId): ChatDoorId {
  return door;
}

export function hrefForChatDoor(door: ChatDoorId): string {
  return door === 'ovie' ? APP_ROUTES.ADMIN_CHAT : APP_ROUTES.CHAT;
}

export function composerPlaceholderForChatDoor(door: ChatDoorId): string {
  return CHAT_DOOR_COMPOSER_PLACEHOLDER[door];
}

export function resolveChatDoorFromPathname(
  pathname: string | null | undefined
): ChatDoorId {
  if (!pathname) return 'jovie';
  const ovChat = APP_ROUTES.ADMIN_CHAT;
  if (pathname === ovChat || pathname.startsWith(`${ovChat}/`)) {
    return 'ovie';
  }
  return 'jovie';
}

export function toggleEntitledChatDoor(input: {
  readonly entitled: boolean;
  readonly current: ChatDoorId;
}): ChatDoorId | null {
  if (!input.entitled) return null;
  return input.current === 'ovie' ? 'jovie' : 'ovie';
}

export function resolveEntitledOvieDoorHref(input: {
  readonly entitled: boolean;
  readonly pathname: string | null | undefined;
}): string | null {
  const next = toggleEntitledChatDoor({
    entitled: input.entitled,
    current: resolveChatDoorFromPathname(input.pathname),
  });
  return next ? hrefForChatDoor(next) : null;
}

export function assertChatDoorOwnsPack(
  door: ChatDoorId,
  packId: ChatDoorId
): void {
  if (door === packId) return;
  throw new Error(
    door === 'ovie'
      ? 'OV chrome cannot stay on Jovie pack'
      : 'Jovie chrome cannot stay on Ovie pack'
  );
}
