import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  GENERAL_WAITLIST_ROLES,
  getWaitlistRoleLabel,
  WAITLIST_ROLE_VALUES,
  WAITLIST_ROLES,
} from './roles';

describe('waitlist roles', () => {
  it('lists every role value once across both forms', () => {
    const values = [...WAITLIST_ROLES, ...GENERAL_WAITLIST_ROLES].map(
      role => role.value
    );
    expect([...WAITLIST_ROLE_VALUES].sort()).toEqual(
      [...new Set(values)].sort()
    );
  });

  it('labels known roles and falls back for unknown ones', () => {
    expect(getWaitlistRoleLabel('producer_songwriter')).toBe(
      'Producer/Songwriter'
    );
    expect(getWaitlistRoleLabel('individual')).toBe('Myself');
    expect(getWaitlistRoleLabel('nope')).toBe('Unknown');
  });

  it('stays free of zod, because the homepage waitlist form imports it', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'lib/waitlist/roles.ts'),
      'utf8'
    );
    expect(source).not.toMatch(/from 'zod'/);
  });
});
