import { describe, expect, it } from 'vitest';
import {
  REGISTRY_SCHEMA,
  validateRegistryTransition,
} from '../automation-registry-policy.mjs';

const row = (id, overrides = {}) => ({
  id: `test:${id}`,
  status: 'live',
  owner: 'test-owner',
  runsAs: 'test-runner',
  host: 'test-host',
  purpose: `Reconcile ${id} receipts.`,
  identity: { purpose: 'reconcile-receipts', scope: `test:${id}` },
  trigger: { kind: 'eve-schedule', repo: 'Test/Registry', source: `${id}.ts` },
  metric: 'receipt age',
  receipt: { kind: 'host-local', location: `${id}.json` },
  maxStalenessMinutes: 60,
  killSwitch: 'disable this definition',
  ...overrides,
});
const inventory = (...entries) => ({ schema: REGISTRY_SCHEMA, entries });
const legacy = row('incumbent', { identity: undefined });
const retire = entry => ({
  ...entry,
  status: 'retired',
  retiredAt: '2026-10-20',
  archive: 'archive/definition.json',
});
const errors = (base, next) =>
  validateRegistryTransition(base, next).join('\n');

describe('mandatory registry transitions', () => {
  it.each(['live', 'retired'])(
    'rejects manual new %s rows without identity',
    status => {
      const added = row('new', { identity: undefined });
      expect(
        errors(
          inventory(legacy),
          inventory(legacy, status === 'live' ? added : retire(added))
        )
      ).toMatch(/identity\.(purpose|scope)/);
    }
  );

  it('requires identity on changed live legacy rows, while preserving unchanged history', () => {
    const old = inventory(legacy, retire(row('old', { identity: undefined })));
    expect(validateRegistryTransition(old, structuredClone(old))).toEqual([]);
    expect(
      errors(
        old,
        inventory({ ...legacy, maxStalenessMinutes: 90 }, old.entries[1])
      )
    ).toMatch(/identity\./);
    expect(
      validateRegistryTransition(
        old,
        inventory(
          {
            ...legacy,
            identity: row('incumbent').identity,
            maxStalenessMinutes: 90,
          },
          old.entries[1]
        )
      )
    ).toEqual([]);
  });

  it.each([
    undefined,
    null,
    { purpose: 'other-purpose', scope: 'test:current' },
    { purpose: 'reconcile-receipts', scope: 'test:replacement' },
  ])('rejects stripping or replacing an assigned identity: %j', identity => {
    const current = row('current');
    expect(
      errors(inventory(current), inventory({ ...current, identity }))
    ).toMatch(/identity/);
  });

  it('rejects deletion and readdition even when the replacement changes its source and purpose', () => {
    const renamed = row('renamed');
    expect(errors(inventory(legacy), inventory(renamed))).toMatch(
      /preserve registry history/
    );
    expect(
      errors(
        inventory(legacy),
        inventory({ ...legacy, id: 'test:renamed', identity: renamed.identity })
      )
    ).toMatch(/preserve registry history/);
  });

  it('permits retirement-only changes without a legacy identity migration', () => {
    expect(
      validateRegistryTransition(inventory(legacy), inventory(retire(legacy)))
    ).toEqual([]);
    expect(
      errors(
        inventory(legacy),
        inventory({ ...retire(legacy), owner: 'different-owner' })
      )
    ).toMatch(/retirement may change only/);
    expect(
      errors(
        inventory(legacy),
        inventory({ ...retire(legacy), trigger: row('replacement').trigger })
      )
    ).toMatch(/retirement may change only/);
  });

  it('keeps retired identities unavailable for reactivation or a new ID', () => {
    const current = row('current');
    const retired = retire(current);
    expect(errors(inventory(retired), inventory(current))).toMatch(
      /cannot be reactivated/
    );
    expect(
      errors(
        inventory(retired),
        inventory(retired, { ...current, id: 'test:new-id' })
      )
    ).toMatch(/base incumbent/);
    expect(
      errors(
        inventory(retired),
        inventory({ ...retired, trigger: row('replacement').trigger })
      )
    ).toMatch(/preserve identity/);
  });

  it('preserves recorded retired/live coexistence while enriching the live legacy row', () => {
    const retired = retire({ ...legacy, id: 'test:old-incumbent' });
    const base = inventory(legacy, retired);
    expect(validateRegistryTransition(base, base)).toEqual([]);
    expect(
      validateRegistryTransition(
        base,
        inventory({ ...legacy, identity: row('incumbent').identity }, retired)
      )
    ).toEqual([]);
  });

  it('does not grandfather a new execution collision merely because identity was already shared', () => {
    const current = row('current');
    const retired = retire(row('past', { identity: current.identity }));
    const base = inventory(current, retired);
    expect(validateRegistryTransition(base, base)).toEqual([]);
    expect(
      errors(base, inventory({ ...current, trigger: retired.trigger }, retired))
    ).toMatch(/base incumbent test:past/);
  });

  it('allows equivalent purposes with distinct declared scopes and execution resources', () => {
    const first = row('production');
    const second = { ...row('staging'), purpose: first.purpose };
    expect(
      validateRegistryTransition(inventory(first), inventory(first, second))
    ).toEqual([]);
  });

  it('rejects competing additions after composition although each passes against the same base', () => {
    const base = inventory(legacy);
    const first = row('production');
    const second = { ...row('competing'), identity: first.identity };
    expect(validateRegistryTransition(base, inventory(legacy, first))).toEqual(
      []
    );
    expect(validateRegistryTransition(base, inventory(legacy, second))).toEqual(
      []
    );
    expect(errors(base, inventory(legacy, first, second))).toMatch(
      /same purpose\/scope identity/
    );
    expect(
      errors(inventory(legacy, first), inventory(legacy, first, second))
    ).toMatch(/same purpose\/scope identity/);
  });

  it.each([
    undefined,
    {},
    inventory(),
    { ...inventory(legacy), parseErrors: ['invalid JSON'] },
  ])('fails closed on unavailable or invalid base evidence: %j', base => {
    expect(
      validateRegistryTransition(base, inventory(legacy)).length
    ).toBeGreaterThan(0);
  });
});
