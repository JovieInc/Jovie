import { beforeEach, expect, it, vi } from 'vitest';
import { getCanonicalContactsByKeys } from './contact-lookup';
import type { CanonicalContactListRow } from './contacts';

const mocks = vi.hoisted(() => ({ build: vi.fn() }));
vi.mock('./contacts', () => ({ buildCanonicalContacts: mocks.build }));

beforeEach(() => {
  mocks.build.mockReset();
});

it('resolves requested identities from one canonical projection', async () => {
  const first = { dedupeKey: 'email:one@fixture.example', leadId: 'one' };
  const second = { dedupeKey: 'email:two@fixture.example', leadId: 'two' };
  mocks.build.mockResolvedValue([first, second] as CanonicalContactListRow[]);
  const result = await getCanonicalContactsByKeys([
    first.dedupeKey,
    first.dedupeKey,
    'email:missing@fixture.example',
  ]);
  expect(result).toEqual(new Map([[first.dedupeKey, first]]));
  expect(mocks.build).toHaveBeenCalledTimes(1);
});

it('does not read the projection for an empty request', async () => {
  expect(await getCanonicalContactsByKeys([])).toEqual(new Map());
  expect(mocks.build).not.toHaveBeenCalled();
});

it('propagates unreadable canonical sources so drafting can fail closed', async () => {
  mocks.build.mockRejectedValue(new Error('identity lookup unavailable'));
  await expect(
    getCanonicalContactsByKeys(['email:one@fixture.example'])
  ).rejects.toThrow('identity lookup unavailable');
});
