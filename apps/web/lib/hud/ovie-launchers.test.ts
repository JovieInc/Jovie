import { describe, expect, it } from 'vitest';
import {
  assertPrimaryRailInvariants,
  buildLauncherControl,
  filterLaunchers,
  githubPullsUrl,
  OVIE_LAUNCHER_CATALOG,
  OVIE_REQUIRED_PRIMARY_LAUNCHER_IDS,
  type OvieLauncherControl,
  originFromUrl,
  publicHref,
  rankLaunchers,
  resolveLauncherDestination,
  stripSecrets,
} from './ovie-launchers';

const READY = Object.fromEntries(
  OVIE_LAUNCHER_CATALOG.filter(item => !item.agentCliOnly).map(item => [
    item.id,
    'ready' as const,
  ])
);

function destinations(
  config: Parameters<typeof resolveLauncherDestination>[1]
) {
  return Object.fromEntries(
    OVIE_LAUNCHER_CATALOG.map(definition => [
      definition.id,
      resolveLauncherDestination(definition, config),
    ])
  );
}

const QUIET = { timActionCount: 0, availability: READY };
const item = (id: string) => OVIE_LAUNCHER_CATALOG.find(row => row.id === id)!;

describe('ovie-launchers inventory', () => {
  it('keeps required human controls on the primary rail and agent CLI in advanced', () => {
    const inventory = rankLaunchers({
      destinations: destinations({
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
    const dest = destinations({});
    const quiet = rankLaunchers({ destinations: dest, state: QUIET });
    const busy = rankLaunchers({
      destinations: dest,
      state: { timActionCount: 4, availability: READY },
    });
    expect(
      busy.primary.find(item => item.id === 'github-prs')?.rankScore ?? 0
    ).toBeGreaterThan(
      quiet.primary.find(item => item.id === 'github-prs')?.rankScore ?? 0
    );
    expect(busy.primary.find(item => item.id === 'github-prs')?.why).toMatch(
      /4 open Tim-action/
    );
    expect(
      quiet.primary.find(item => item.id === 'github-prs')?.why
    ).not.toMatch(/Tim-action/);
  });

  it('fails closed when required controls are crowded out or agent CLI is promoted', () => {
    const inventory = rankLaunchers({
      destinations: destinations({}),
      state: QUIET,
    });
    expect(() =>
      assertPrimaryRailInvariants({
        ...inventory,
        primary: inventory.primary.filter(item => item.id !== 'gbrain'),
      })
    ).toThrow(/Required human control "gbrain"/);
    expect(() =>
      assertPrimaryRailInvariants({
        ...inventory,
        primary: [
          ...inventory.primary,
          inventory.advanced[0] as OvieLauncherControl,
        ],
      })
    ).toThrow(/Agent-only control/);
    expect(() =>
      rankLaunchers({
        catalog: OVIE_LAUNCHER_CATALOG.filter(item => item.id !== 'gbrain'),
        destinations: destinations({}),
        state: QUIET,
      })
    ).toThrow(/Required human control "gbrain"/);
    expect(() =>
      rankLaunchers({
        catalog: OVIE_LAUNCHER_CATALOG.map(item =>
          item.id === 'hermes-cli-worker'
            ? { ...item, requiredOnPrimary: true }
            : item
        ),
        destinations: destinations({}),
        state: QUIET,
      })
    ).toThrow(/Agent-only control "hermes-cli-worker"/);
  });

  it('does not invent account-specific or secret-bearing URLs', () => {
    expect(
      resolveLauncherDestination(item('gbrain'), {
        gbrainApiUrl: 'http://127.0.0.1:7801/mcp?q=1',
      }).href
    ).toBe('http://127.0.0.1:7801');
    expect(githubPullsUrl('JovieInc', 'Jovie')).toBe(
      'https://github.com/JovieInc/Jovie/pulls'
    );
    expect(githubPullsUrl('../evil', 'Jovie')).toBeNull();
    expect(resolveLauncherDestination(item('mercury'), {}).href).toBe(
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
    const symphony = resolveLauncherDestination(item('symphony'), {
      symphonySshHost: 'evil.example',
    });
    expect(symphony.href).toBeUndefined();
    expect(symphony.sshHost).toBe('gem');
    expect(symphony.display).toBe('ssh gem');
    expect(
      buildLauncherControl({
        definition: item('symphony'),
        destination: symphony,
        status: 'ready',
        timActionCount: 0,
      }).why
    ).not.toMatch(/4041/);
    const matches = filterLaunchers(
      rankLaunchers({
        destinations: destinations({ gbrainApiUrl: 'http://127.0.0.1:7801' }),
        state: QUIET,
      }).all,
      'symphony tui'
    );
    expect(matches.map(row => row.id)).toEqual(['symphony']);
    expect(matches[0]?.destinationDisplay).toMatch(/^ssh /);
  });
});
