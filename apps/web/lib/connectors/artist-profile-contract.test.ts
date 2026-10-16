import { describe, expect, it } from 'vitest';
import {
  ARTIST_PROFILE_FIELDS,
  type ArtistProfileContract,
  unknownArtistProfileContract,
} from './artist-profile-contract';
import { ARTIST_PROFILE_FIELD_ACCESSORS } from './artist-profile-fields';
import { CONNECTOR_REGISTRY } from './registry';
import {
  connectorRegistrySchema,
  validateConnectorRegistry,
} from './registry-validation';

/** Hypothetical policy fixture, never a claim about a real provider's profile API. */
function readyField(): ArtistProfileContract['fields']['bio'] {
  const authorization = {
    status: 'verified',
    mechanism: 'oauth',
    requiredScopes: ['https://www.googleapis.com/auth/youtube.force-ssl'],
    resource: 'connected channel selected by channels.list(mine=true)',
    requiredRole: 'owner',
    evidenceRef: 'fixture:verified-channel-ownership',
  } as const;
  return {
    read: 'supported',
    write: 'supported',
    authorization: { read: authorization, write: authorization },
    validation: {
      status: 'documented',
      policyRef: 'fixture:bio-length-and-format',
    },
    preview: {
      status: 'required',
      policyRef: 'fixture:show-before-and-after',
      binding: 'destination_field_value',
    },
    confirmation: {
      status: 'required',
      policyRef: 'fixture:confirm-exact-preview',
      binding: 'destination_field_value',
    },
    rateLimit: {
      status: 'documented',
      policyRef: 'fixture:quota',
      key: 'connection',
      maxRequests: 1,
      windowSeconds: 60,
      onLimit: 'respect_retry_after',
    },
    audit: {
      mode: 'before_after',
      policyRef: 'fixture:record-write-and-readback',
    },
    rollback: {
      mode: 'snapshot_restore',
      policyRef: 'fixture:restore-previous-value',
      evidenceRef: 'fixture:tested-restore',
    },
    termsApi: {
      status: 'approved',
      api: 'official',
      apiRef: 'fixture:profile-api',
      termsRef: 'fixture:terms',
      evidenceRef: 'fixture:terms-review',
    },
    evidence: {
      status: 'documented',
      requirements: [
        'authorization',
        'before_after',
        'confirmation',
        'documentation',
        'preview',
        'readback',
        'rollback',
        'validation',
      ],
      refs: ['fixture:profile-contract-proof'],
    },
  };
}

function readyRegistry() {
  return {
    ...CONNECTOR_REGISTRY,
    youtube: {
      ...CONNECTOR_REGISTRY.youtube,
      artistProfile: {
        fields: {
          bio: readyField(),
          bio_link: readyField(),
          image: readyField(),
          website: readyField(),
        },
      },
    },
  };
}

/** Invalid manifests are deliberately untyped input to the actual registry boundary. */
function expectRejectedField(patch: Record<string, unknown>, path: string[]) {
  const registry = readyRegistry();
  const result = connectorRegistrySchema.safeParse({
    ...registry,
    youtube: {
      ...registry.youtube,
      artistProfile: {
        fields: {
          ...registry.youtube.artistProfile.fields,
          bio: { ...readyField(), ...patch },
        },
      },
    },
  });
  expect(result.success).toBe(false);
  if (result.success) throw new Error('Unsafe profile contract was accepted');
  expect(result.error.issues.map(issue => issue.path)).toContainEqual([
    'youtube',
    'artistProfile',
    'fields',
    'bio',
    ...path,
  ]);
}

describe('artist-profile registry contract', () => {
  it('validates the live registry without granting profile access from unrelated scopes', () => {
    expect(connectorRegistrySchema.safeParse(CONNECTOR_REGISTRY).success).toBe(
      true
    );
    expect(CONNECTOR_REGISTRY.gmail.artistProfile).toBeNull();
    expect(CONNECTOR_REGISTRY.google_calendar.artistProfile).toBeNull();
    for (const id of ['spotify', 'youtube'] as const) {
      const profile = CONNECTOR_REGISTRY[id].artistProfile;
      expect(Object.keys(profile.fields)).toEqual([...ARTIST_PROFILE_FIELDS]);
      for (const field of Object.values(profile.fields)) {
        expect(field.read).toBe('unknown');
        expect(field.write).toBe('unknown');
        expect(field.authorization.write.status).toBe('unknown');
      }
    }
  });

  it('accepts a complete, evidenced profile contract through the registry', () => {
    const registry = readyRegistry();
    expect(validateConnectorRegistry(registry)).toBe(registry);
  });

  it('rejects incomplete manifests at the live registry construction boundary', () => {
    const registry = readyRegistry();
    const invalid = {
      ...registry,
      youtube: { ...registry.youtube, artistProfile: {} },
    };
    expect(() =>
      validateConnectorRegistry(invalid as unknown as typeof registry)
    ).toThrow();
  });

  it.each(ARTIST_PROFILE_FIELDS)(
    'rejects an incomplete field set missing %s',
    name => {
      const registry = readyRegistry();
      const fields: Record<string, unknown> = {
        ...registry.youtube.artistProfile.fields,
      };
      delete fields[name];
      registry.youtube.artistProfile = {
        fields,
      } as unknown as ArtistProfileContract;
      const result = connectorRegistrySchema.safeParse(registry);
      expect(result.success).toBe(false);
      if (!result.success)
        expect(result.error.issues.map(issue => issue.path)).toContainEqual([
          'youtube',
          'artistProfile',
          'fields',
          name,
        ]);
    }
  );

  it('rejects extra fields and destination-specific storage declarations', () => {
    const registry = readyRegistry();
    const result = connectorRegistrySchema.safeParse({
      ...registry,
      youtube: {
        ...registry.youtube,
        artistProfile: {
          fields: {
            ...registry.youtube.artistProfile.fields,
            display_name: readyField(),
          },
          profileTable: 'youtube_profiles',
        },
      },
    });
    expect(result.success).toBe(false);
  });

  it.each(['preview', 'confirmation'] as const)(
    'rejects writes without %s',
    policy => {
      expectRejectedField({ [policy]: undefined }, [policy]);
      for (const status of ['unsupported', 'unknown']) {
        expectRejectedField(
          { [policy]: { status, reason: 'fixture:no-policy' } },
          [policy]
        );
      }
    }
  );

  it.each([
    'validation',
    'rateLimit',
    'audit',
    'rollback',
    'termsApi',
    'evidence',
  ])('rejects missing %s policy', policy =>
    expectRejectedField({ [policy]: undefined }, [policy])
  );

  it.each(['validation', 'rateLimit', 'termsApi', 'evidence'])(
    'rejects unknown %s on a supported write',
    policy =>
      expectRejectedField(
        { [policy]: { status: 'unknown', reason: 'fixture:unverified' } },
        [policy]
      )
  );

  it.each(['read', 'write'] as const)(
    'rejects ambiguous %s authorization',
    mode => {
      for (const status of ['unknown', 'unsupported']) {
        expectRejectedField(
          {
            authorization: {
              ...readyField().authorization,
              [mode]: { status, reason: 'fixture:unverified' },
            },
          },
          ['authorization', mode]
        );
      }
    }
  );

  it.each(
    [[], [''], ['   '], ['*'], ['youtube.*'], ['scope with spaces']].map(
      scopes => ({ scopes })
    )
  )('rejects empty or ambiguous scopes $scopes', ({ scopes }) => {
    const auth = readyField().authorization.write;
    expectRejectedField(
      {
        authorization: {
          ...readyField().authorization,
          write: { ...auth, requiredScopes: scopes },
        },
      },
      ['authorization', 'write', 'requiredScopes']
    );
  });

  it('rejects scopes that the existing connector does not request', () => {
    expectRejectedField(
      {
        authorization: {
          ...readyField().authorization,
          write: {
            ...readyField().authorization.write,
            requiredScopes: ['profile.write'],
          },
        },
      },
      ['authorization', 'write', 'requiredScopes']
    );
  });

  it('rejects public write authorization', () => {
    expectRejectedField(
      {
        authorization: {
          ...readyField().authorization,
          write: {
            status: 'public',
            resource: 'public-channel',
            evidenceRef: 'fixture:public',
          },
        },
      },
      ['authorization', 'write']
    );
  });

  it('accepts public reads with unsupported writes and explicit unavailable policies', () => {
    const registry = readyRegistry();
    registry.youtube.artistProfile.fields.bio = {
      ...readyField(),
      write: 'unsupported',
      authorization: {
        read: {
          status: 'public',
          resource: 'public-channel',
          evidenceRef: 'fixture:public',
        },
        write: { status: 'unsupported', reason: 'fixture:no-write-api' },
      },
      preview: { status: 'unsupported', reason: 'fixture:no-write-api' },
      confirmation: { status: 'unsupported', reason: 'fixture:no-write-api' },
      audit: { mode: 'unsupported', reason: 'fixture:no-write-api' },
      rollback: { mode: 'unsupported', reason: 'fixture:no-write-api' },
    };
    expect(connectorRegistrySchema.safeParse(registry).success).toBe(true);
  });

  it('allows unknown readiness only as an explicitly non-supported contract', () => {
    const registry = readyRegistry();
    registry.youtube.artistProfile = unknownArtistProfileContract(
      'fixture:unverified-api'
    );
    expect(connectorRegistrySchema.safeParse(registry).success).toBe(true);
    expectRejectedField(
      { rollback: { mode: 'unknown', reason: 'fixture:unknown-readiness' } },
      ['rollback']
    );
  });

  it('rejects unsupported automatic rollback claims', () => {
    expectRejectedField(
      { rollback: { mode: 'automatic', policyRef: 'fixture:unsupported' } },
      ['rollback']
    );
    expectRejectedField({ read: 'unsupported' }, ['rollback']);
    expectRejectedField({ write: 'unsupported' }, ['rollback']);
    expectRejectedField(
      { audit: { mode: 'unknown', reason: 'fixture:no-snapshot' } },
      ['rollback']
    );
  });

  it('allows an explicitly irreversible write and an evidenced compensating write', () => {
    for (const rollback of [
      { mode: 'unsupported', reason: 'fixture:provider-cannot-restore' },
      {
        mode: 'compensating_write',
        policyRef: 'fixture:compensate',
        evidenceRef: 'fixture:tested',
      },
    ] as const) {
      const registry = readyRegistry();
      registry.youtube.artistProfile.fields.bio.rollback = rollback;
      expect(connectorRegistrySchema.safeParse(registry).success).toBe(true);
    }
  });

  it.each([
    'authorization',
    'before_after',
    'confirmation',
    'documentation',
    'preview',
    'readback',
    'rollback',
    'validation',
  ] as const)(
    'rejects a write missing the %s evidence requirement',
    requirement => {
      const evidence = readyField().evidence;
      if (evidence.status !== 'documented')
        throw new Error('Incomplete fixture');
      expectRejectedField(
        {
          evidence: {
            ...evidence,
            requirements: evidence.requirements.filter(
              item => item !== requirement
            ),
          },
        },
        requirement === 'rollback' ? ['evidence'] : ['evidence', 'requirements']
      );
    }
  );

  it('rejects absent profile classification and provider id mismatches', () => {
    expect(
      connectorRegistrySchema.safeParse({
        ...CONNECTOR_REGISTRY,
        youtube: { ...CONNECTOR_REGISTRY.youtube, artistProfile: undefined },
      }).success
    ).toBe(false);
    expect(
      connectorRegistrySchema.safeParse({
        ...CONNECTOR_REGISTRY,
        youtube: { ...CONNECTOR_REGISTRY.youtube, id: 'spotify' },
      }).success
    ).toBe(false);
  });
});

describe('canonical artist-profile field sources', () => {
  const profile = {
    avatar_url: 'https://images.example.com/artist.jpg',
    bio: 'Artist bio',
    username: 'Artist',
    username_normalized: 'artist',
  };
  const website = {
    id: 'website',
    platform: 'website',
    platform_type: 'custom',
    url: 'https://artist.example.com',
    sort_order: 2,
    is_active: true,
    state: 'active',
  } as const;

  it('maps the closed fields to the existing profile, social links, and canonical route', () => {
    const sources = { profile, socialLinks: [website] };
    expect(Object.keys(ARTIST_PROFILE_FIELD_ACCESSORS)).toEqual([
      ...ARTIST_PROFILE_FIELDS,
    ]);
    expect(ARTIST_PROFILE_FIELD_ACCESSORS.image(sources)).toBe(
      profile.avatar_url
    );
    expect(ARTIST_PROFILE_FIELD_ACCESSORS.bio(sources)).toBe(profile.bio);
    expect(ARTIST_PROFILE_FIELD_ACCESSORS.website(sources)).toBe(website.url);
    expect(ARTIST_PROFILE_FIELD_ACCESSORS.bio_link(sources)).toBe(
      'https://jov.ie/artist'
    );
  });

  it('leaves multiple active website candidates unavailable without mutating sources', () => {
    const socialLinks = [
      { ...website, id: 'rejected', state: 'rejected' as const, sort_order: 0 },
      { ...website, id: 'inactive', is_active: false, sort_order: 0 },
      { ...website, id: 'social', platform: 'instagram', sort_order: 0 },
      website,
      { ...website, id: 'z', sort_order: 1, url: 'https://z.example.com' },
      {
        ...website,
        id: 'a',
        platform: 'custom',
        platform_type: 'website',
        sort_order: 1,
        url: 'https://a.example.com',
      },
    ];
    const original = [...socialLinks];
    expect(
      ARTIST_PROFILE_FIELD_ACCESSORS.website({ profile, socialLinks })
    ).toBeNull();
    expect(socialLinks).toEqual(original);
  });

  it('preserves missing values and derives bio_link from the current username', () => {
    const sources = {
      profile: { avatar_url: null, bio: null, username: 'NEW' },
      socialLinks: [],
    };
    expect(ARTIST_PROFILE_FIELD_ACCESSORS.image(sources)).toBeNull();
    expect(ARTIST_PROFILE_FIELD_ACCESSORS.bio(sources)).toBeNull();
    expect(ARTIST_PROFILE_FIELD_ACCESSORS.website(sources)).toBeNull();
    expect(ARTIST_PROFILE_FIELD_ACCESSORS.bio_link(sources)).toBe(
      'https://jov.ie/new'
    );
  });
});
