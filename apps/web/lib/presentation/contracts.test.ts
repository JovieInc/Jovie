import { describe, expect, expectTypeOf, it } from 'vitest';
import { PRODUCT_ONTOLOGY } from '@/data/productOntology';
import {
  type ConnectionFact,
  type DisplayModel,
  defineNomenclature,
  displayText,
  identifierCopyProps,
  machineTextReasons,
  type NomenclatureEntry,
  type StatusSelector,
  shouldAnnounceStatus,
  toAgentRequestDisplay,
} from './contracts';
import { toLibraryAgentRequest } from './library-display';
import { productNomenclature } from './product-nomenclature';

describe('presentation foundations', () => {
  it('detects the raw-JSON baseline without requiring the old source to keep leaking', () => {
    const asset = {
      id: 'release-1',
      title: 'Tidal Drift',
      artist: 'Luna Waves',
    };
    // Fixture of the aac92c18 library-chat-context.ts shape. A later owner can
    // fix that builder without a test requiring the defect to remain present.
    const legacyFixture = `Help me with this library item.\n${JSON.stringify({
      kind: 'release',
      ...asset,
      profileId: 'profile-1',
      revision: null,
    })}`;
    expect(machineTextReasons(legacyFixture)).toContain('json');
    const request = toLibraryAgentRequest(asset, 'profile-1');
    expect(machineTextReasons(request.message)).toEqual([]);
    expect(request.contextAttachments[0].entityId).toBe(asset.id);
  });
  it('keeps identifiers and revision out of composer/history display', () => {
    const request = toLibraryAgentRequest(
      {
        id: 'private-id',
        title: 'Tidal Drift',
        artist: 'Luna Waves',
        updatedAt: 'private-revision',
      },
      'private-profile'
    );
    expect(request.contextAttachments[0]).toMatchObject({
      entityId: 'private-id',
      profileId: 'private-profile',
      revision: 'private-revision',
    });
    expect(toAgentRequestDisplay(request)).toEqual({
      message: 'Help me with this library item.',
      attachments: [{ title: 'Tidal Drift', description: 'Luna Waves' }],
    });
    expect(JSON.stringify(toAgentRequestDisplay(request))).not.toContain(
      'private-'
    );
    expectTypeOf<{ title: string }>().not.toExtend<DisplayModel>();
  });

  it('does not turn an absent artist into undefined visible text', () => {
    const request = toLibraryAgentRequest(
      { id: 'item', title: 'Tidal Drift', artist: '' },
      'profile'
    );
    expect(toAgentRequestDisplay(request).attachments).toEqual([
      { title: 'Tidal Drift' },
    ]);
    expect(request.contextAttachments[0].revision).toBeNull();
    expect(() => displayText(' ')).toThrow('empty');
  });

  it('preserves the library entity kind for server-side reference resolution', () => {
    const request = toLibraryAgentRequest(
      { id: 'document-1', title: 'Notes', artist: '', itemKind: 'document' },
      'profile'
    );
    expect(request.contextAttachments[0]).toMatchObject({
      kind: 'library-item',
      itemKind: 'document',
    });
  });

  it('derives product names and routes from the existing ontology', () => {
    for (const entry of productNomenclature) {
      expect(entry.title).toBe(PRODUCT_ONTOLOGY[entry.routeId].label);
      expect(entry.route).toBe(PRODUCT_ONTOLOGY[entry.routeId].canonicalRoute);
    }
  });

  const entry = (
    routeId: string,
    parent: string | null = null
  ): NomenclatureEntry => ({
    routeId,
    route: `/${routeId}`,
    noun: displayText(routeId),
    navLabel: displayText(routeId),
    title: displayText(routeId),
    parent,
    switcher: [],
  });
  it('rejects duplicate ownership, orphan references and cycles for either app', () => {
    expect(() => defineNomenclature([entry('a'), entry('a')])).toThrow(
      'Duplicate route ID'
    );
    expect(() =>
      defineNomenclature([entry('a'), { ...entry('b'), route: '/a' }])
    ).toThrow('ownership');
    expect(() => defineNomenclature([entry('a', 'absent')])).toThrow('Orphan');
    expect(() =>
      defineNomenclature([{ ...entry('a'), switcher: ['absent'] }])
    ).toThrow('Orphan');
    expect(() =>
      defineNomenclature([entry('a', 'b'), entry('b', 'a')])
    ).toThrow('Cyclic');
    expect(
      defineNomenclature([entry('ovie'), entry('child', 'ovie')])
    ).toHaveLength(2);
  });

  it('keeps profile linkage distinct from account connection in shared selectors', () => {
    type Profile = Extract<ConnectionFact, { kind: 'profile-link' }>;
    type Account = Extract<ConnectionFact, { kind: 'account-connection' }>;
    expectTypeOf<Profile>().not.toExtend<Account>();
    const select: StatusSelector<{ account: Account }, Account> = snapshot =>
      snapshot.account;
    const snapshot = {
      profile: { kind: 'profile-link', state: 'linked' } satisfies Profile,
      account: {
        kind: 'account-connection',
        state: 'not_connected',
      } satisfies Account,
    };
    const ui = select(snapshot);
    const chat = select(snapshot);
    expect(ui).toEqual(chat);
    expect(ui.state).toBe('not_connected');
  });

  it('keeps defaults silent and validates aggregate scope', () => {
    expect(shouldAnnounceStatus({ scope: 'row', isDefault: true })).toBe(false);
    expect(shouldAnnounceStatus({ scope: 'row', isDefault: false })).toBe(true);
    expect(
      shouldAnnounceStatus({ scope: 'section', total: 62, exceptions: 0 })
    ).toBe(false);
    expect(
      shouldAnnounceStatus({ scope: 'page', total: 62, exceptions: 1 })
    ).toBe(true);
    for (const exceptions of [-1, 2, NaN, 0.5])
      expect(() =>
        shouldAnnounceStatus({ scope: 'page', total: 1, exceptions })
      ).toThrow();
  });

  it('copies the full identifier only from plain text, preserving existing controls', () => {
    const id = {
      kind: 'upc',
      text: '001…',
      copyText: '00198391390616',
    } as const;
    expect(identifierCopyProps(id, 'text')).toEqual({
      copyable: true,
      copyText: id.copyText,
    });
    for (const surface of ['button', 'select', 'link'] as const)
      expect(identifierCopyProps(id, surface)).toEqual({ copyable: false });
    expect(identifierCopyProps({ ...id, copyText: ' ' }, 'text')).toEqual({
      copyable: false,
    });
  });
});
