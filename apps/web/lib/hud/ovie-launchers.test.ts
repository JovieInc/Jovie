import { describe, expect, it } from 'vitest';
import {
  assertPrimaryRailInvariants,
  buildLauncherControl,
  filterLaunchers,
  githubPullsUrl,
  OVIE_LAUNCHER_CATALOG,
  OVIE_REQUIRED_PRIMARY_LAUNCHER_IDS,
  type OvieLauncherControl,
  type OvieLauncherDefinition,
  type OvieLauncherInventory,
  type OvieLauncherResolvedDestination,
  originFromUrl,
  publicHref,
  rankLaunchers,
  resolveLauncherDestination,
  stripSecrets,
} from './ovie-launchers';

const READY: Record<string, 'ready'> = Object.fromEntries(
  OVIE_LAUNCHER_CATALOG.filter(item => !item.agentCliOnly).map(item => [
    item.id,
    'ready' as const,
  ])
);

function destinationsFromConfig(config: {
  readonly gbrainApiUrl?: string;
  readonly hermesWebUrl?: string;
  readonly symphonySshHost?: string;
  readonly githubOwner?: string;
  readonly githubRepo?: string;
  readonly productionOrigin?: string;
}): Record<string, OvieLauncherResolvedDestination> {
  return Object.fromEntries(
    OVIE_LAUNCHER_CATALOG.map(definition => [
      definition.id,
      resolveLauncherDestination(definition, config),
    ])
  );
}

function catalogItem(id: string): OvieLauncherDefinition {
  return OVIE_LAUNCHER_CATALOG.find(
    item => item.id === id
  ) as OvieLauncherDefinition;
}

describe('ovie-launchers inventory', () => {
  it('keeps required human controls on the primary rail and agent CLI in advanced', () => {
    const inventory = rankLaunchers({
      destinations: destinationsFromConfig({
        gbrainApiUrl: 'http://100.64.1.2:7801/mcp',
        hermesWebUrl: 'http://127.0.0.1:7800',
        productionOrigin: 'https://jov.ie',
      }),
      state: { timActionCount: 2, availability: READY },
    });
    expect(inventory.primary.map(item => item.id)).toEqual(
      expect.arrayContaining([...OVIE_REQUIRED_PRIMARY_LAUNCHER_IDS])
    );
    expect(
      inventory.primary.every(
        item => item.owner === 'human' && !item.agentCliOnly
      )
    ).toBe(true);
    expect(inventory.advanced.every(item => item.agentCliOnly)).toBe(true);
  });

  it('raises review tools from verified Tim-action count only', () => {
    const destinations = destinationsFromConfig({});
    const quiet = rankLaunchers({
      destinations,
      state: { timActionCount: 0, availability: READY },
    });
    const busy = rankLaunchers({
      destinations,
      state: { timActionCount: 4, availability: READY },
    });
    const githubQuiet = quiet.primary.find(item => item.id === 'github-prs');
    const githubBusy = busy.primary.find(item => item.id === 'github-prs');
    expect(githubBusy?.rankScore ?? 0).toBeGreaterThan(
      githubQuiet?.rankScore ?? 0
    );
    expect(githubBusy?.why).toMatch(/4 open Tim-action/);
    expect(githubQuiet?.why).not.toMatch(/Tim-action/);
  });

  it('fails closed when required controls are crowded out or agent CLI is promoted', () => {
    const inventory = rankLaunchers({
      destinations: destinationsFromConfig({}),
      state: { timActionCount: 0, availability: READY },
    });
    const crowded: OvieLauncherInventory = {
      ...inventory,
      primary: inventory.primary.filter(item => item.id !== 'gbrain'),
    };
    expect(() => assertPrimaryRailInvariants(crowded)).toThrow(
      /Required human control "gbrain"/
    );
    const poisoned: OvieLauncherInventory = {
      ...inventory,
      primary: [
        ...inventory.primary,
        inventory.advanced[0] as OvieLauncherControl,
      ],
    };
    expect(() => assertPrimaryRailInvariants(poisoned)).toThrow(
      /Agent-only control/
    );
    expect(() =>
      rankLaunchers({
        catalog: OVIE_LAUNCHER_CATALOG.filter(item => item.id !== 'gbrain'),
        destinations: destinationsFromConfig({}),
        state: { timActionCount: 0, availability: READY },
      })
    ).toThrow(/Required human control "gbrain"/);
    expect(() =>
      rankLaunchers({
        catalog: OVIE_LAUNCHER_CATALOG.map(item =>
          item.id === 'hermes-cli-worker'
            ? { ...item, requiredOnPrimary: true }
            : item
        ),
        destinations: destinationsFromConfig({}),
        state: { timActionCount: 0, availability: READY },
      })
    ).toThrow(/Agent-only control "hermes-cli-worker"/);
  });

  it('does not invent account-specific or secret-bearing URLs', () => {
    const gbrain = resolveLauncherDestination(catalogItem('gbrain'), {
      gbrainApiUrl: 'http://127.0.0.1:7801/mcp?q=1',
    });
    expect(gbrain.href).toBe('http://127.0.0.1:7801');
    expect(githubPullsUrl('JovieInc', 'Jovie')).toBe(
      'https://github.com/JovieInc/Jovie/pulls'
    );
    expect(githubPullsUrl('../evil', 'Jovie')).toBeNull();
    expect(resolveLauncherDestination(catalogItem('mercury'), {}).href).toBe(
      'https://app.mercury.com'
    );
    expect(
      stripSecrets('status=down token=placeholder bearer=placeholder')
    ).toBe('status=down token=redacted bearer=redacted');
    expect(publicHref('https://example.com/path?q=1#frag')).toBe(
      'https://example.com/path'
    );
    expect(originFromUrl('http://127.0.0.1:7801/health')).toBe(
      'http://127.0.0.1:7801'
    );
  });

  it('keeps Symphony on SSH, searchable, and off the homemade 4041 API', () => {
    const symphony = resolveLauncherDestination(catalogItem('symphony'), {
      symphonySshHost: 'evil.example',
    });
    expect(symphony.href).toBeUndefined();
    expect(symphony.sshHost).toBe('gem');
    expect(symphony.display).toBe('ssh gem');
    const control = buildLauncherControl({
      definition: catalogItem('symphony'),
      destination: symphony,
      status: 'ready',
      timActionCount: 0,
    });
    expect(control.why).not.toMatch(/4041/);
    const matches = filterLaunchers(
      rankLaunchers({
        destinations: destinationsFromConfig({
          gbrainApiUrl: 'http://127.0.0.1:7801',
        }),
        state: { timActionCount: 0, availability: READY },
      }).all,
      'symphony tui'
    );
    expect(matches.map(item => item.id)).toEqual(['symphony']);
    expect(matches[0]?.destinationDisplay).toMatch(/^ssh /);
  });
});
