import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import { commandsForSurface, isCommandVisible } from './registry';

describe('Presence command visibility', () => {
  const presence = commandsForSurface('cmdk').find(
    command => command.kind === 'nav' && command.id === 'go-presence'
  );

  it('gates the Cmd-K Presence row on PROFILES_WORKSPACE', () => {
    expect(presence).toMatchObject({
      kind: 'nav',
      href: APP_ROUTES.PRESENCE,
      requiredFlag: 'PROFILES_WORKSPACE',
    });
  });

  it('hides Presence when the flag is off and keeps other nav rows', () => {
    expect(presence).toBeDefined();
    if (!presence) return;

    expect(isCommandVisible(presence, { PROFILES_WORKSPACE: false })).toBe(
      false
    );
    expect(isCommandVisible(presence, {})).toBe(false);
    expect(isCommandVisible(presence, { PROFILES_WORKSPACE: true })).toBe(true);

    const otherNav = commandsForSurface('cmdk').filter(
      command => command.kind === 'nav' && command.id !== 'go-presence'
    );
    expect(otherNav.length).toBeGreaterThan(0);
    for (const command of otherNav) {
      expect(isCommandVisible(command, {})).toBe(true);
    }
  });
});
