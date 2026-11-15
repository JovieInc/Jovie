import {
  OVIE_LAUNCHER_CATALOG,
  type OvieLauncherInventory,
  type OvieLauncherStatus,
  rankLaunchers,
  resolveLauncherDestination,
} from '@/lib/hud/ovie-launchers';

/** Shared fixtures for the OvieLauncherRail state stories and tests. */
export function launcherInventory(
  status: (id: string) => OvieLauncherStatus = () => 'ready'
): OvieLauncherInventory {
  return rankLaunchers({
    generatedAtIso: '2026-10-29T10:00:00.000Z',
    destinations: Object.fromEntries(
      OVIE_LAUNCHER_CATALOG.map(definition => [
        definition.id,
        resolveLauncherDestination(definition, {}),
      ])
    ),
    state: {
      timActionCount: 0,
      availability: Object.fromEntries(
        OVIE_LAUNCHER_CATALOG.filter(item => !item.agentCliOnly).map(item => [
          item.id,
          status(item.id),
        ])
      ),
    },
  });
}

export const EMPTY_LAUNCHER_INVENTORY: OvieLauncherInventory = {
  generatedAtIso: '2026-10-29T10:00:00.000Z',
  primary: [],
  advanced: [],
  all: [],
};
