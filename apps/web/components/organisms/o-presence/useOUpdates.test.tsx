import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { countLabel, type OUpdateSpec } from '@/lib/ovie/o-updates';
import { useOUpdates } from './useOUpdates';

type Item = { readonly id: string; readonly state: string };

const spec: OUpdateSpec<readonly Item[]> = {
  key: 'test.items',
  label: countLabel('release shipped', 'releases shipped'),
  href: '/app/ov/shipping',
  countChanged: (previous, next) => {
    const before = new Map(previous.map(item => [item.id, item.state]));
    return next.filter(item => before.get(item.id) !== item.state).length;
  },
};

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => useOUpdates(), { wrapper });
  const read = async (
    key: string,
    data: unknown,
    meta: unknown = { oUpdate: spec }
  ) => {
    await act(async () => {
      await client.fetchQuery({
        queryKey: [key],
        queryFn: () => Promise.resolve(data),
        staleTime: 0,
        meta: meta as Record<string, unknown>,
      });
    });
  };
  return { ...hook, client, read };
}

const a: readonly Item[] = [
  { id: 'a', state: 'open' },
  { id: 'b', state: 'open' },
];

describe('useOUpdates', () => {
  it('treats the first read as a baseline and shows nothing', async () => {
    const { result, read } = setup();
    await read('items', a);
    expect(result.current.update).toBeNull();
  });

  it('shows nothing when a refetch returns structurally equal data', async () => {
    const { result, read } = setup();
    await read('items', a);
    await read(
      'items',
      a.map(item => ({ ...item }))
    );
    expect(result.current.update).toBeNull();
  });

  it('shows nothing for equal data without a custom counter', async () => {
    const { result, read } = setup();
    const plain = { oUpdate: { key: 'plain', label: 'Changed' } };
    await read('plain', { n: 1, rows: [1, 2] }, plain);
    await read('plain', { n: 1, rows: [1, 2] }, plain);
    expect(result.current.update).toBeNull();
    await read('plain', { n: 2, rows: [1, 2] }, plain);
    expect(result.current.update).toMatchObject({ label: 'Changed', count: 1 });
  });

  it('shows the label and link when data changed', async () => {
    const { result, read } = setup();
    await read('items', a);
    await read('items', [a[0] as Item, { id: 'b', state: 'shipped' }]);
    expect(result.current.update).toMatchObject({
      label: '1 release shipped',
      count: 1,
      href: '/app/ov/shipping',
    });
  });

  it('counts exactly the items that changed', async () => {
    const { result, read } = setup();
    await read('items', a);
    await read('items', [
      { id: 'a', state: 'shipped' },
      { id: 'b', state: 'shipped' },
      { id: 'c', state: 'open' },
    ]);
    expect(result.current.update).toMatchObject({
      label: '3 releases shipped',
      count: 3,
    });
  });

  it('merges several sources into one update with the real total', async () => {
    const { result, read } = setup();
    const other = { oUpdate: { ...spec, key: 'test.other' } };
    await read('items', a);
    await read('other', a, other);
    await read('items', [{ id: 'a', state: 'shipped' }, a[1] as Item]);
    await read(
      'other',
      [
        { id: 'a', state: 'x' },
        { id: 'b', state: 'x' },
      ],
      other
    );
    expect(result.current.update).toMatchObject({
      label: '3 updates',
      count: 3,
    });
  });

  it('ignores queries that did not opt in and failed counters', async () => {
    const { result, read } = setup();
    await read('quiet', { n: 1 }, undefined);
    await read('quiet', { n: 2 }, undefined);
    const broken = {
      oUpdate: {
        key: 'broken',
        label: 'x',
        countChanged: () => {
          throw new Error('bad shape');
        },
      },
    };
    await read('broken', 1, broken);
    await read('broken', 2, broken);
    expect(result.current.update).toBeNull();
  });

  it('clears after the view is done with it', async () => {
    const { result, read } = setup();
    await read('items', a);
    await read('items', [{ id: 'a', state: 'shipped' }, a[1] as Item]);
    expect(result.current.update).not.toBeNull();
    act(() => result.current.clear());
    expect(result.current.update).toBeNull();
  });
});
