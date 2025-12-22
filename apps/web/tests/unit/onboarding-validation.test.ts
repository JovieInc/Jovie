import { describe, expect, it } from 'vitest';
import { validateUsernameFormat } from '@/lib/validation/client-username';
import { validateUsername } from '@/lib/validation/username';

const cases = [
  {
    name: 'valid simple handle',
    handle: 'artistname',
    valid: true,
    error: undefined,
  },
  {
    name: 'too short',
    handle: 'ab',
    valid: false,
    errorIncludes: 'at least',
  },
  {
    name: 'too long',
    handle: 'a'.repeat(31),
    valid: false,
    errorIncludes: 'no more than',
  },
  {
    name: 'invalid characters',
    handle: 'bad_handle',
    valid: false,
    errorIncludes: 'hyphens',
  },
  {
    name: 'leading hyphen',
    handle: '-artist',
    valid: false,
    errorIncludes: 'start with a letter',
  },
  {
    name: 'trailing hyphen',
    handle: 'artist-',
    valid: false,
    errorIncludes: 'cannot end with a hyphen',
  },
  {
    name: 'consecutive hyphens',
    handle: 'artist--name',
    valid: false,
    errorIncludes: 'consecutive hyphens',
  },
  {
    name: 'reserved word',
    handle: 'admin',
    valid: false,
    errorIncludes: 'reserved',
  },
];

describe('onboarding username validation parity', () => {
  cases.forEach(testCase => {
    it(`matches client/server rules: ${testCase.name}`, () => {
      const client = validateUsernameFormat(testCase.handle);
      const server = validateUsername(testCase.handle);

      expect(client.valid).toBe(testCase.valid);
      expect(server.isValid).toBe(testCase.valid);

      if (!testCase.valid && testCase.errorIncludes) {
        expect(client.error ?? '').toContain(testCase.errorIncludes);
        expect(server.error ?? '').toContain(testCase.errorIncludes);
      }
    });
  });
});
