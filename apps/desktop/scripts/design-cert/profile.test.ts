import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  resolveLocalDesignCertCdp,
  resolveLocalDesignCertProfile,
} from '../../src/design-cert-profile';

describe('local desktop design-cert profile', () => {
  it('isolates a named local certification run from another Jovie Local shell', () => {
    expect(
      resolveLocalDesignCertProfile({
        appEnv: 'local',
        appDataPath: '/tmp/app-data',
        argv: ['electron', '.', '--jovie-design-cert-profile=ovie-01'],
      })
    ).toEqual({
      kind: 'isolated',
      userDataPath: join('/tmp/app-data', 'Jovie-Local-Design-Cert-ovie-01'),
    });
  });

  it('accepts the local environment hook used by the dev launcher', () => {
    expect(
      resolveLocalDesignCertProfile({
        appEnv: 'local',
        appDataPath: '/tmp/app-data',
        argv: [],
        environmentProfile: 'loop-02',
      })
    ).toMatchObject({ kind: 'isolated' });
  });

  it('never changes staging or production user data', () => {
    for (const appEnv of ['staging', 'production'] as const) {
      expect(
        resolveLocalDesignCertProfile({
          appEnv,
          appDataPath: '/tmp/app-data',
          argv: ['--jovie-design-cert-profile=ignored'],
          environmentProfile: 'ignored',
        })
      ).toEqual({ kind: 'default' });
    }
  });

  it('fails closed on traversal, spaces, or ambiguous profile names', () => {
    for (const profile of ['../other', 'ovie one', '-ovie', 'ovie-', 'OVIE']) {
      expect(
        resolveLocalDesignCertProfile({
          appEnv: 'local',
          appDataPath: '/tmp/app-data',
          argv: [`--jovie-design-cert-profile=${profile}`],
        })
      ).toEqual({ kind: 'invalid', profile });
    }
  });

  it('enables loopback CDP only for an isolated local certification profile', () => {
    const profile = resolveLocalDesignCertProfile({
      appEnv: 'local',
      appDataPath: '/tmp/app-data',
      argv: ['--jovie-design-cert-profile=ovie-01'],
    });
    expect(
      resolveLocalDesignCertCdp({
        appEnv: 'local',
        profile,
        argv: ['--jovie-design-cert-cdp-port=39527'],
      })
    ).toEqual({ kind: 'enabled', port: 39527 });

    expect(
      resolveLocalDesignCertCdp({
        appEnv: 'staging',
        profile: { kind: 'default' },
        argv: ['--jovie-design-cert-cdp-port=39527'],
      })
    ).toEqual({ kind: 'invalid', value: '39527' });
  });

  it('fails closed on malformed or privileged certification CDP ports', () => {
    const profile = {
      kind: 'isolated',
      userDataPath: '/tmp/app-data/Jovie-Local-Design-Cert-ovie-01',
    } as const;
    for (const value of ['abc', '0', '922.5', '70000']) {
      expect(
        resolveLocalDesignCertCdp({
          appEnv: 'local',
          profile,
          argv: [`--jovie-design-cert-cdp-port=${value}`],
        })
      ).toEqual({ kind: 'invalid', value });
    }
  });
});
