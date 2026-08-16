import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  UI_OWNERSHIP_ENTRY_IDS,
  UI_OWNERSHIP_PLATFORMS,
  UI_OWNERSHIP_REGISTRY,
  UI_OWNERSHIP_REGISTRY_SCHEMA,
  UI_OWNERSHIP_STATES,
  UI_OWNERSHIP_SURFACES,
  type UIOwnershipRegistryEntry,
  validateUIOwnershipRegistry,
} from '@/data/designSystem';

type Entry = UIOwnershipRegistryEntry;
const root = path.resolve(__dirname, '../../../../..');
const codes = (entries: readonly Entry[]) =>
  validateUIOwnershipRegistry({ entries }).map(issue => issue.code);
const mutate = (id: string, change: (entry: Entry) => Partial<Entry>) =>
  UI_OWNERSHIP_REGISTRY.map(entry =>
    entry.id === id ? { ...entry, ...change(entry) } : entry
  ) as readonly Entry[];
const item = (id: Entry['id']) =>
  UI_OWNERSHIP_REGISTRY.find(entry => entry.id === id) as Entry;
const expectIssue = (entries: readonly Entry[], code: string) =>
  expect(codes(entries)).toContain(code);

describe('cross-surface UI ownership registry', () => {
  it('is source-backed, closed-world, and complete', () => {
    expect(UI_OWNERSHIP_REGISTRY_SCHEMA).toBe('jovie.ui-ownership/v1');
    expect(UI_OWNERSHIP_REGISTRY.map(entry => entry.id)).toEqual(
      UI_OWNERSHIP_ENTRY_IDS
    );
    expect(validateUIOwnershipRegistry()).toEqual([]);
    expect(new Set(UI_OWNERSHIP_STATES).size).toBe(UI_OWNERSHIP_STATES.length);
    expect(
      UI_OWNERSHIP_SURFACES.every(surface =>
        UI_OWNERSHIP_REGISTRY.some(entry => entry.surfaces.includes(surface))
      )
    ).toBe(true);
    expect(
      UI_OWNERSHIP_PLATFORMS.every(platform =>
        UI_OWNERSHIP_REGISTRY.every(entry =>
          entry.platformAdapters.some(adapter => adapter.platform === platform)
        )
      )
    ).toBe(true);
    for (const entry of UI_OWNERSHIP_REGISTRY) {
      expect(entry.sourcePaths).toContain(entry.canonicalOwner.sourcePath);
      for (const sourcePath of [
        ...entry.sourcePaths,
        ...entry.platformAdapters.flatMap(adapter => adapter.sourcePaths),
      ]) {
        expect(sourcePath).not.toContain('.pen');
        expect(fs.existsSync(path.join(root, sourcePath))).toBe(true);
      }
    }
    expect(item('organism.app-shell-frame').surfaceElevation).toEqual({
      page: 'canvas',
      sidebar: 'canvas',
      main: 'panel',
    });
    expect(item('molecule.profile-primary-cta').visibleControlGeometry).toEqual(
      { visiblePx: 32, hitTargetPx: 44, appliesTo: 'marketing-control' }
    );
  });
  it('fails closed on duplicate ownership, source paths, and aliases', () => {
    const [first, second] = UI_OWNERSHIP_REGISTRY;
    expectIssue(
      mutate(second.id, () => ({
        canonicalOwner: { ...first.canonicalOwner },
      })),
      'duplicate-owner'
    );
    expectIssue(
      mutate(second.id, () => ({ sourcePaths: [...first.sourcePaths] })),
      'duplicate-source-path'
    );
    expectIssue(
      mutate(second.id, () => ({
        duplicateAliases: [first.duplicateAliases[0]],
      })),
      'duplicate-alias'
    );
  });

  it('fails closed on missing required states and adapters', () => {
    const button = item('atom.button');
    expectIssue(
      mutate(button.id, entry => ({
        states: entry.states.filter(state => state !== 'loading'),
      })),
      'missing-required-state'
    );
    expectIssue(
      mutate(button.id, entry => ({
        platformAdapters: entry.platformAdapters.map(adapter =>
          adapter.platform === 'ios'
            ? { ...adapter, status: 'implemented', sourcePaths: [] }
            : adapter
        ),
      })),
      'missing-platform-adapter'
    );
  });

  it('fails closed on serif policy and Pen proposal/canonical confusion', () => {
    expectIssue(
      mutate('organism.marketing-header', entry => ({
        typography: {
          ...entry.typography,
          family: 'Georgia',
        } as Entry['typography'],
      })),
      'unregistered-serif'
    );
    expectIssue(
      mutate('organism.marketing-header', entry => ({
        typography: {
          ...entry.typography,
          serifException: {
            kind: 'media',
            sourcePath: 'proposal.pen',
            owner: '',
            reason: '',
          },
        },
      })),
      'unregistered-serif'
    );
    expectIssue(
      mutate('atom.button', entry => ({
        pen: { ...entry.pen, identity: null, sourceBacked: false },
      })),
      'pen-status-conflict'
    );
    expectIssue(
      mutate('atom.link', entry => ({
        pen: {
          ...entry.pen,
          status: 'proposal',
          sourceBacked: true,
          identity: 'proposal:link',
          reason: undefined,
        } as Entry['pen'],
      })),
      'pen-status-conflict'
    );
  });
});
