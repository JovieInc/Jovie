import { describe, expect, it, vi } from 'vitest';
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
  it('never falls back to a same-name registry row after an external-ID miss', async () => {
    const query = makeQuery([]);
    const tx = { select: vi.fn().mockReturnValue(query) };

    const found = await findArtist(
      { spotifyId: 'spotify-alex-two', name: 'Alex Lee' },
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
      spotifyId: 'spotify-alex-two',
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
      { name: 'Alex Lee', spotifyId: 'spotify-alex-two' },
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
      spotifyId: 'spotify-alex-two',
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
      { name: 'Alex Lee', spotifyId: 'spotify-alex-two' },
      tx as never
    );

    expect(result).toBe(winner);
    expect(tx.select).toHaveBeenCalledTimes(2);
    expect(insertQuery.onConflictDoNothing).toHaveBeenCalledTimes(1);
  });
});
