import { describe, expect, it } from 'vitest';
import {
  getPublicProfileElements,
  isPublicProfileElementVisible,
  isPublicProfileFieldPolicy,
  PUBLIC_PROFILE_ELEMENTS,
  type PublicProfileElements,
} from './public-profile-elements';

function policy(
  visible: boolean,
  overrides: Partial<PublicProfileElements> = {}
) {
  return {
    version: 1,
    fields: {
      ...Object.fromEntries(PUBLIC_PROFILE_ELEMENTS.map(key => [key, visible])),
      ...overrides,
    },
  };
}

describe('anonymous public element policy', () => {
  it.each([
    undefined,
    null,
    {},
    { searchable: false },
    { isVerified: true, plan: 'pro' },
  ])(
    'preserves legacy public elements when no choice is stored: %j',
    settings => {
      expect(
        Object.values(getPublicProfileElements(settings)).every(Boolean)
      ).toBe(true);
    }
  );

  it('honors a complete fixed policy without changing publication, discovery, or contact consent', () => {
    const settings = {
      searchable: false,
      require_double_opt_in: true,
      public_fields: policy(true, {
        bio: false,
        contacts: false,
        links: false,
      }),
    };
    const original = structuredClone(settings);
    expect(isPublicProfileElementVisible(settings, 'bio')).toBe(false);
    expect(isPublicProfileElementVisible(settings, 'contacts')).toBe(false);
    expect(isPublicProfileElementVisible(settings, 'links')).toBe(false);
    expect(isPublicProfileElementVisible(settings, 'identity')).toBe(true);
    expect(settings).toEqual(original);
  });

  it.each([
    null,
    'all',
    true,
    [],
    {},
    { version: 2, fields: policy(true).fields },
    { ...policy(true), audience: 'owner' },
    { version: 1, fields: { bio: true } },
    { version: 1, fields: { ...policy(true).fields, owner: true } },
    { version: 1, fields: { ...policy(true).fields, contacts: 'true' } },
  ])(
    'fails closed for malformed or unsupported explicit policy: %j',
    public_fields => {
      expect(isPublicProfileFieldPolicy(public_fields)).toBe(false);
      expect(
        Object.values(getPublicProfileElements({ public_fields })).some(Boolean)
      ).toBe(false);
    }
  );

  it.each(['invalid settings', [], true, 1])(
    'fails closed for malformed settings: %j',
    settings => {
      expect(
        Object.values(getPublicProfileElements(settings)).some(Boolean)
      ).toBe(false);
    }
  );

  it('does not turn owner, plan, human, or bot labels into grants', () => {
    const hidden = policy(false);
    for (const audience of ['human', 'bot', 'owner', 'admin']) {
      const settings = {
        public_fields: hidden,
        audience,
        role: 'owner',
        isVerified: true,
        plan: 'pro',
      };
      expect(
        Object.values(getPublicProfileElements(settings)).some(Boolean)
      ).toBe(false);
    }
  });

  it('cannot inherit permissions from a prototype or mutate another profile policy', () => {
    expect(isPublicProfileFieldPolicy(Object.create(policy(true)))).toBe(false);
    const inherited = Object.create(policy(true).fields);
    expect(isPublicProfileFieldPolicy({ version: 1, fields: inherited })).toBe(
      false
    );
    const first = getPublicProfileElements({});
    expect(Object.isFrozen(first)).toBe(true);
    expect(() => {
      (first as Record<string, boolean>).contacts = false;
    }).toThrow();
    expect(isPublicProfileElementVisible({}, 'contacts')).toBe(true);
    expect(isPublicProfileElementVisible({}, '__proto__' as never)).toBe(false);
  });
});
