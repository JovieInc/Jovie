import { describe, expect, it } from 'vitest';
import { resolveTaskPersistence } from './task-persistence';

const request = { scopeId: 'account-1', requestId: 'request-1' };
const receipt = {
  ...request,
  objectId: 'link-1',
  revision: 2,
  durability: 'remote' as const,
};

describe('task persistence presentation', () => {
  it('requires an acknowledged object and revision for this scope and request', () => {
    expect(resolveTaskPersistence(request)).toBe('acknowledgement-unknown');
    for (const invalid of [
      { ...receipt, scopeId: 'account-2' },
      { ...receipt, requestId: 'request-2' },
      { ...receipt, objectId: ' ' },
      { ...receipt, revision: 0 },
      { ...receipt, revision: 1.5 },
      { ...receipt, revision: Number.NaN },
      { ...receipt, durability: 'future' as 'remote' },
    ]) {
      expect(resolveTaskPersistence(request, invalid)).toBe(
        'acknowledgement-unknown'
      );
    }
    expect(resolveTaskPersistence(request, receipt)).toBe('persisted-remotely');
    expect(resolveTaskPersistence({ ...request, scopeId: '' }, receipt)).toBe(
      'acknowledgement-unknown'
    );
    expect(resolveTaskPersistence({ ...request, requestId: '' }, receipt)).toBe(
      'acknowledgement-unknown'
    );
  });

  it('keeps local durability distinct from remote acknowledgement', () => {
    expect(
      resolveTaskPersistence(request, { ...receipt, durability: 'local' })
    ).toBe('persisted-locally');
  });
});
