import { describe, expect, it } from 'vitest';
import { sourceHostProfile } from '../src/source-host-profile';

describe('source-host session isolation', () => {
  const env = { JOVIE_DEV: '1', JOVIE_DEV_USER_DATA_DIR: '/tmp/source-host' };
  it('uses an explicit absolute profile for local source opt-in', () => {
    expect(sourceHostProfile(false, 'local', env)).toBe('/tmp/source-host');
    expect(() =>
      sourceHostProfile(false, 'local', {
        ...env,
        JOVIE_DEV_USER_DATA_DIR: 'relative',
      })
    ).toThrow('absolute');
  });
  it('never changes packaged, production, staging, or non-opted-in profiles', () => {
    expect(sourceHostProfile(true, 'local', env)).toBeNull();
    expect(sourceHostProfile(false, 'production', env)).toBeNull();
    expect(sourceHostProfile(false, 'staging', env)).toBeNull();
    expect(
      sourceHostProfile(false, 'local', { ...env, JOVIE_DEV: '0' })
    ).toBeNull();
    expect(sourceHostProfile(false, 'local', {})).toBeNull();
  });
});
