import { describe, expect, it } from 'vitest';
import { isInvalidUuidInput } from './invalid-uuid-input';

describe('isInvalidUuidInput', () => {
  it('recognizes a Postgres 22P02 code', () => {
    const error = Object.assign(new Error('bad'), { code: '22P02' });
    expect(isInvalidUuidInput(error)).toBe(true);
  });

  it('recognizes the driver message and a wrapped cause', () => {
    expect(
      isInvalidUuidInput(
        new Error('query failed', {
          cause: new Error('invalid input syntax for type uuid: "fake-id-000"'),
        })
      )
    ).toBe(true);
  });

  it('ignores unrelated failures', () => {
    expect(isInvalidUuidInput(new Error('connection reset'))).toBe(false);
    expect(isInvalidUuidInput(null)).toBe(false);
  });
});
