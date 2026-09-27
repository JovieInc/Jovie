import { readFileSync } from 'node:fs';
import path from 'node:path';
import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  exampleItemQueryOptions,
  exampleKeys,
  exampleListInfiniteQueryOptions,
} from './examples';
import type { FetchResponseSchema } from './fetch';

const mocks = vi.hoisted(() => ({
  fetchWithTimeout: vi.fn(async () => ({ id: 'x', name: 'x' })),
}));

vi.mock('@/lib/queries/fetch', async () => {
  const actual = await vi.importActual<typeof import('@/lib/queries/fetch')>(
    '@/lib/queries/fetch'
  );
  return { ...actual, fetchWithTimeout: mocks.fetchWithTimeout };
});

const README_PATH = path.join(__dirname, 'README.md');

describe('query example fixtures (JOV-6190)', () => {
  afterEach(() => {
    mocks.fetchWithTimeout.mockClear();
  });

  it('binds the resource id into the URL and forwards the request signal', async () => {
    const options = exampleItemQueryOptions('abc-123');
    const controller = new AbortController();

    await options.queryFn?.({
      signal: controller.signal,
      queryKey: exampleKeys.item('abc-123'),
      client: new QueryClient(),
      meta: undefined,
    });

    expect(mocks.fetchWithTimeout).toHaveBeenCalledWith(
      '/api/examples/abc-123',
      expect.objectContaining({ signal: controller.signal })
    );
  });

  it('attaches a response decoder at the fetch boundary', async () => {
    const options = exampleItemQueryOptions('abc-123');
    await options.queryFn?.({
      signal: new AbortController().signal,
      queryKey: exampleKeys.item('abc-123'),
      client: new QueryClient(),
      meta: undefined,
    });

    const [, init] = mocks.fetchWithTimeout.mock.calls[0] as unknown as [
      string,
      { schema?: FetchResponseSchema<unknown> },
    ];
    expect(init.schema).toBeDefined();
    expect(() => init.schema?.parse({ id: 1 })).toThrow();
    expect(init.schema?.parse({ id: 'a', name: 'b' })).toEqual({
      id: 'a',
      name: 'b',
    });
  });

  it('scopes the paginated read key by actor/resource scope', () => {
    const options = exampleListInfiniteQueryOptions('profile-9');
    expect(options.queryKey).toEqual(exampleKeys.list('profile-9'));
    expect(options.initialPageParam).toBe('');
    expect(
      options.getNextPageParam?.(
        { items: [], nextCursor: 'c2' },
        [] as never,
        '',
        [] as never
      )
    ).toBe('c2');
    expect(
      options.getNextPageParam?.(
        { items: [], nextCursor: null },
        [] as never,
        '',
        [] as never
      )
    ).toBeNull();
  });

  it('does not key-collide between item, list, and search fixtures', () => {
    const keys = [
      exampleKeys.item('a'),
      exampleKeys.list('a'),
      exampleKeys.search('a'),
    ].map(k => JSON.stringify(k));
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('README drift guard (JOV-6190)', () => {
  const readme = readFileSync(README_PATH, 'utf8');

  it('references the compiled fixture module', () => {
    expect(readme).toContain('examples.ts');
  });

  it('no longer documents the broken createQueryFn({ id }) wiring', () => {
    // The old snippet called the createQueryFn result with `{ id }`; the
    // helper's contract is `({ signal })` and the id must live in the URL.
    expect(readme).not.toMatch(/fetchFoo\(\{ id \}\)/);
    expect(readme).not.toMatch(/queryFn:\s*\(\)\s*=>\s*\w+\(\{ id \}\)/);
  });
});
