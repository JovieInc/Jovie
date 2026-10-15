import { describe, expect, it, vi } from 'vitest';
import { SemanticContractError } from '@/lib/canonical/semantic-contract';
import {
  findArtist,
  findOrCreateArtist,
} from '@/lib/discography/artist-queries/artist-crud';

function makeQuery(result: unknown[]) {
  const limit = vi.fn().mockResolvedValue(result);
  const query = {
    from: vi.fn(),
    where: vi.fn(),
    limit,
  };
  query.from.mockReturnValue(query);
  query.where.mockReturnValue(query);
  return query;
}

describe('artist identity CRUD', () => {
  it('quarantines provider IDs already mapped to different canonical artists', async () => {
    const query = makeQuery([
      { id: 'one', spotifyId: '3TVXtAsWU1IfumKqIcMftp' },
      { id: 'two', appleMusicId: '123' },
    ]);
    const tx = { select: vi.fn().mockReturnValue(query), update: vi.fn() };
    await expect(
      findOrCreateArtist(
        {
          name: 'Alex Lee',
          spotifyId: '3TVXtAsWU1IfumKqIcMftp',
          appleMusicId: '123',
        },
        tx as never
      )
    ).rejects.toBeInstanceOf(SemanticContractError);
    expect(tx.update).not.toHaveBeenCalled();
  });

  it('quarantines a contradictory ID even when another provider matches', async () => {
    const query = makeQuery([
      { id: 'one', spotifyId: '3TVXtAsWU1IfumKqIcMftp', appleMusicId: '456' },
    ]);
    await expect(
      findArtist({ spotifyId: '3TVXtAsWU1IfumKqIcMftp', appleMusicId: '123' }, {
        select: vi.fn().mockReturnValue(query),
      } as never)
    ).rejects.toMatchObject({
      decision: { rejections: [{ code: 'conflicting_provider_identity' }] },
    });
  });

  it('does not resolve an ambiguous legacy name without a stable ID', async () => {
    const query = makeQuery([{ id: 'one' }, { id: 'two' }]);
    await expect(
      findArtist({ name: 'Alex Lee' }, {
        select: vi.fn().mockReturnValue(query),
      } as never)
    ).rejects.toBeInstanceOf(SemanticContractError);
  });

  it('rejects attempts to attach a profile through resolution before any DB access', async () => {
    const select = vi.fn();
    await expect(
      findOrCreateArtist({ name: 'Alex Lee', creatorProfileId: 'tenant-two' }, {
        select,
      } as never)
    ).rejects.toMatchObject({
      decision: { rejections: [{ code: 'profile_binding_not_authorized' }] },
    });
    expect(select).not.toHaveBeenCalled();
  });

  it.each(['updated', 'replayed', 'stale'])(
    'uses admitted IDs for lookup and enrichment (%s)',
    async outcome => {
      const artist = {
        id: 'one',
        name: 'Alex Lee',
        spotifyId: '3TVXtAsWU1IfumKqIcMftp',
        appleMusicId: null,
        deezerId: null,
        musicbrainzId: null,
        imageUrl: null,
      };
      const query = makeQuery([artist]);
      const mutation = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi
          .fn()
          .mockResolvedValue(
            outcome === 'updated' ? [{ ...artist, appleMusicId: '123' }] : []
          ),
      };
      const tx = {
        select: vi
          .fn()
          .mockReturnValueOnce(query)
          .mockReturnValue(
            makeQuery([
              {
                ...artist,
                appleMusicId: outcome === 'replayed' ? '123' : null,
              },
            ])
          ),
        update: vi.fn().mockReturnValue(mutation),
      };
      const result = findOrCreateArtist(
        {
          name: 'Alex Lee',
          spotifyId: ' 3TVXtAsWU1IfumKqIcMftp ',
          appleMusicId: ' 123 ',
        },
        tx as never
      );
      if (outcome !== 'stale') {
        await expect(result).resolves.toMatchObject({ appleMusicId: '123' });
      } else {
        await expect(result).rejects.toMatchObject({
          decision: { rejections: [{ code: 'stale_identity_observation' }] },
        });
      }
      expect(mutation.set).toHaveBeenCalledWith(
        expect.objectContaining({ appleMusicId: '123' })
      );
    }
  );

  it('never falls back to a same-name registry row after an external-ID miss', async () => {
    const query = makeQuery([]);
    const tx = { select: vi.fn().mockReturnValue(query) };

    const found = await findArtist(
      { spotifyId: '3TVXtAsWU1IfumKqIcMftp', name: 'Alex Lee' },
      tx as never
    );

    expect(found).toBeNull();
    expect(tx.select).toHaveBeenCalledTimes(1);
    expect(query.limit).toHaveBeenCalledTimes(1);
  });

  it('retains legacy name lookup only when no stable identity is supplied', async () => {
    const artist = { id: 'artist-alex-one', name: 'Alex Lee' };
    const query = makeQuery([artist]);
    const tx = { select: vi.fn().mockReturnValue(query) };

    const found = await findArtist({ name: 'Alex Lee' }, tx as never);

    expect(found).toBe(artist);
    expect(tx.select).toHaveBeenCalledTimes(1);
  });

  it('creates a second same-name artist when the provider ID is distinct', async () => {
    const lookupQuery = makeQuery([]);
    const created = {
      id: 'artist-alex-two',
      name: 'Alex Lee',
      spotifyId: '3TVXtAsWU1IfumKqIcMftp',
    };
    const returning = vi.fn().mockResolvedValue([created]);
    const insertQuery = {
      values: vi.fn(),
      onConflictDoNothing: vi.fn(),
      returning,
    };
    insertQuery.values.mockReturnValue(insertQuery);
    insertQuery.onConflictDoNothing.mockReturnValue(insertQuery);
    const tx = {
      select: vi.fn().mockReturnValue(lookupQuery),
      insert: vi.fn().mockReturnValue(insertQuery),
    };

    const result = await findOrCreateArtist(
      { name: 'Alex Lee', spotifyId: '3TVXtAsWU1IfumKqIcMftp' },
      tx as never
    );

    expect(result).toBe(created);
    expect(tx.select).toHaveBeenCalledTimes(1);
    expect(tx.insert).toHaveBeenCalledTimes(1);
  });

  it('resolves an exact-ID winner after a concurrent idempotent insert', async () => {
    const winner = {
      id: 'artist-alex-two',
      name: 'Alex Lee',
      spotifyId: '3TVXtAsWU1IfumKqIcMftp',
    };
    const firstLookup = makeQuery([]);
    const secondLookup = makeQuery([winner]);
    const returning = vi.fn().mockResolvedValue([]);
    const insertQuery = {
      values: vi.fn(),
      onConflictDoNothing: vi.fn(),
      returning,
    };
    insertQuery.values.mockReturnValue(insertQuery);
    insertQuery.onConflictDoNothing.mockReturnValue(insertQuery);
    const tx = {
      select: vi
        .fn()
        .mockReturnValueOnce(firstLookup)
        .mockReturnValueOnce(secondLookup),
      insert: vi.fn().mockReturnValue(insertQuery),
    };

    const result = await findOrCreateArtist(
      { name: 'Alex Lee', spotifyId: '3TVXtAsWU1IfumKqIcMftp' },
      tx as never
    );

    expect(result).toBe(winner);
    expect(tx.select).toHaveBeenCalledTimes(2);
    expect(insertQuery.onConflictDoNothing).toHaveBeenCalledTimes(1);
  });
});
