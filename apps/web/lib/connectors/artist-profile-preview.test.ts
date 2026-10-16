import { describe, expect, it, vi } from 'vitest';
import {
  ARTIST_PROFILE_FIELDS,
  type ArtistProfileContract,
  type ArtistProfileField,
  unknownArtistProfileContract,
} from './artist-profile-contract';
import {
  type ArtistProfilePreviewInput,
  type ProfilePreviewBlocker,
  previewArtistProfileChanges,
} from './artist-profile-preview';
import type { ArtistProfilePreviewManifest } from './artist-profile-preview-manifest';
import type { ArtistProfileSnapshot } from './artist-profile-snapshot.server';
import { DSP_PROFILE_CATALOG } from './dsp-profile-catalog';

// Hypothetical destination policies; these make no claims about a real provider.
function policy(): ArtistProfileContract['fields']['bio'] {
  const auth = {
    status: 'verified',
    mechanism: 'oauth',
    requiredScopes: ['profile.write'],
    resource: 'connected artist',
    requiredRole: 'owner',
    evidenceRef: 'fixture:ownership',
  } as const;
  return {
    read: 'supported',
    write: 'supported',
    authorization: {
      read: { ...auth, requiredScopes: ['profile.read'] },
      write: auth,
    },
    validation: { status: 'documented', policyRef: 'fixture:validation' },
    preview: {
      status: 'required',
      policyRef: 'fixture:preview',
      binding: 'destination_field_value',
    },
    confirmation: {
      status: 'required',
      policyRef: 'fixture:confirmation',
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
    audit: { mode: 'before_after', policyRef: 'fixture:audit' },
    rollback: {
      mode: 'snapshot_restore',
      policyRef: 'fixture:rollback',
      evidenceRef: 'fixture:restore-test',
    },
    termsApi: {
      status: 'approved',
      api: 'official',
      apiRef: 'fixture:api',
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
      refs: ['fixture:procedures'],
    },
  };
}
function fixture() {
  const target = {
    providerId: 'fixture_provider',
    connectorAccountId: 'connection-1',
    destinationAccountId: 'artist-1',
  };
  const url = {
    policyRef: 'fixture:validation',
    transform: 'identity' as const,
    maxLength: 200,
    allowedProtocols: ['https:' as const],
  };
  const manifest: ArtistProfilePreviewManifest = {
    providerId: target.providerId,
    version: '1',
    artistProfile: {
      fields: {
        bio: policy(),
        bio_link: policy(),
        image: policy(),
        website: policy(),
      },
    },
    constraints: {
      bio: {
        policyRef: 'fixture:validation',
        transform: 'trim',
        minLength: 1,
        maxLength: 100,
        lengthUnit: 'code_points',
      },
      bio_link: { ...url },
      website: { ...url },
      image: {
        ...url,
        mimeTypes: ['image/jpeg', 'image/png'],
        maxBytes: 5000,
        minWidth: 100,
        minHeight: 100,
        maxWidth: 1000,
        maxHeight: 1000,
      },
    },
    termsEvidence: {
      'fixture:terms-review': {
        reviewedAt: '2026-10-01T00:00:00Z',
        expiresAt: '2026-11-01T00:00:00Z',
      },
    },
    execution: { status: 'documented', timeoutMs: 5000, maxAttempts: 2 },
  };
  const values = {
    bio: '  New bio  ',
    bio_link: 'https://jov.ie/artist',
    image: 'https://example.com/image.png',
    website: 'https://example.com',
  };
  const fields = Object.fromEntries(
    ARTIST_PROFILE_FIELDS.map(field => [
      field,
      {
        status: 'available',
        value: values[field],
        provenance: {
          source: 'creator_profiles',
          profileId: 'profile-1',
          profileEditVersion: 4,
          column: 'bio',
        },
      },
    ])
  ) as unknown as ArtistProfileSnapshot['fields'];
  const snapshot: ArtistProfileSnapshot = {
    profileId: 'profile-1',
    profileEditVersion: 4,
    revision: 'canonical-revision-1',
    fields,
  };
  return {
    snapshot,
    manifest,
    target,
    selectedFields: [...ARTIST_PROFILE_FIELDS],
    authorization: {
      target: { ...target },
      scopes: ['profile.read', 'profile.write'],
      role: 'owner' as const,
    },
    evidenceRefs: [
      'fixture:ownership',
      'fixture:restore-test',
      'fixture:terms-review',
      'fixture:procedures',
      'fixture:image',
    ],
    imageEvidence: {
      value: values.image,
      mimeType: 'image/png',
      bytes: 5000,
      width: 100,
      height: 1000,
      evidenceRef: 'fixture:image',
    },
    destination: {
      target: { ...target },
      fields: Object.fromEntries(
        ARTIST_PROFILE_FIELDS.map(field => [
          field,
          {
            value:
              field === 'image' ? 'https://example.com/before.png' : 'before',
            version: 'destination-v1',
            observedAt: '2026-10-15T00:00:00Z',
          },
        ])
      ),
    },
    now: '2026-10-16T00:00:00Z',
  } satisfies ArtistProfilePreviewInput;
}
type Fixture = ReturnType<typeof fixture>;
function value(
  input: Fixture,
  field: ArtistProfileField,
  next: string | null
): ArtistProfilePreviewInput {
  const previous = input.snapshot.fields[field];
  return {
    ...input,
    selectedFields: [field],
    snapshot: {
      ...input.snapshot,
      fields: {
        ...input.snapshot.fields,
        [field]:
          next === null
            ? {
                status: 'unavailable',
                value: null,
                reason: 'missing',
                provenance: previous.provenance,
              }
            : { ...previous, status: 'available', value: next },
      },
    },
  };
}
function blocked(
  input: ArtistProfilePreviewInput,
  code: ProfilePreviewBlocker
) {
  const result = previewArtistProfileChanges(input);
  expect(result.status).toBe('blocked');
  expect(result.blockers).toContain(code);
  return result;
}

describe('deterministic artist profile previews', () => {
  it('returns exact field-level values, requirements, evidence and rollback without I/O or input mutation', () => {
    const input = fixture();
    const before = structuredClone(input);
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('No provider I/O permitted'));
    try {
      const result = previewArtistProfileChanges(input);
      expect(result.status).toBe('confirmable');
      expect(result.blockers).toEqual([]);
      expect(result.fields.map(field => field.field)).toEqual([
        ...ARTIST_PROFILE_FIELDS,
      ]);
      const bio = result.fields[0];
      expect(bio.canonical?.value).toBe('  New bio  ');
      expect(bio.outboundValue).toBe('New bio');
      expect(bio.destination).toEqual(input.destination.fields.bio);
      expect(bio.validation.every(check => check.valid)).toBe(true);
      expect(bio.warnings).toEqual(['value_transformed']);
      expect(bio.requiredAuthorization).toEqual(
        input.manifest.artistProfile.fields.bio.authorization.write
      );
      expect(bio.confirmation).toEqual({
        policy: input.manifest.artistProfile.fields.bio.confirmation,
        status: 'required',
        checksum: result.checksum,
      });
      expect(bio.evidence.missingRefs).toEqual([]);
      expect(bio.evidence.policy).toEqual(
        input.manifest.artistProfile.fields.bio.evidence
      );
      expect(bio.rollback?.mode).toBe('snapshot_restore');
      expect(
        result.fields.find(field => field.field === 'image')?.evidence.image
      ).toEqual(input.imageEvidence);
      expect(fetch).not.toHaveBeenCalled();
      expect(input).toEqual(before);
    } finally {
      fetch.mockRestore();
    }
  });

  const blockers: {
    name: string;
    code: ProfilePreviewBlocker;
    change: (input: Fixture) => ArtistProfilePreviewInput;
  }[] = [
    {
      name: 'unsupported vocabulary',
      code: 'unsupported_field',
      change: input => ({
        ...input,
        selectedFields: ['display_name', '__proto__'],
      }),
    },
    {
      name: 'unsupported destination field',
      code: 'unsupported_field',
      change: input => {
        input.manifest.artistProfile =
          unknownArtistProfileContract('not implemented');
        return input;
      },
    },
    {
      name: 'missing canonical value',
      code: 'canonical_unavailable',
      change: input => value(input, 'bio', null),
    },
    {
      name: 'expired terms evidence at exact expiry',
      code: 'terms_evidence_stale',
      change: input => ({ ...input, now: '2026-11-01T00:00:00Z' }),
    },
    {
      name: 'future terms evidence',
      code: 'terms_evidence_stale',
      change: input => ({ ...input, now: '2026-09-30T00:00:00Z' }),
    },
    {
      name: 'missing terms evidence',
      code: 'terms_evidence_stale',
      change: input => {
        input.manifest.termsEvidence = {};
        return input;
      },
    },
    {
      name: 'missing write scopes',
      code: 'missing_scopes',
      change: input => ({
        ...input,
        authorization: { ...input.authorization, scopes: ['profile.read'] },
      }),
    },
    {
      name: 'missing read scopes',
      code: 'missing_scopes',
      change: input => ({
        ...input,
        authorization: { ...input.authorization, scopes: ['profile.write'] },
      }),
    },
    {
      name: 'wrong authorization account',
      code: 'authorization_required',
      change: input => ({
        ...input,
        authorization: {
          ...input.authorization,
          target: { ...input.target, destinationAccountId: 'other' },
        },
      }),
    },
    {
      name: 'unverified role',
      code: 'authorization_required',
      change: input => ({
        ...input,
        authorization: { ...input.authorization, role: 'unknown' },
      }),
    },
    {
      name: 'manager cannot satisfy owner requirement',
      code: 'authorization_required',
      change: input => ({
        ...input,
        authorization: { ...input.authorization, role: 'manager' },
      }),
    },
    {
      name: 'unmet evidence',
      code: 'evidence_unmet',
      change: input => ({ ...input, evidenceRefs: [] }),
    },
    {
      name: 'unknown execution limits',
      code: 'execution_limits_unknown',
      change: input => {
        input.manifest.execution = {
          status: 'unknown',
          reason: 'not measured',
        };
        return input;
      },
    },
    {
      name: 'invalid execution limits',
      code: 'invalid_manifest',
      change: input => ({
        ...input,
        manifest: {
          ...input.manifest,
          execution: { status: 'documented', timeoutMs: 0, maxAttempts: 1 },
        },
      }),
    },
    {
      name: 'missing snapshot for rollback',
      code: 'rollback_snapshot_missing',
      change: input => ({ ...input, destination: undefined }),
    },
    {
      name: 'invalid value',
      code: 'invalid_value',
      change: input => value(input, 'bio', 'x'.repeat(101)),
    },
    {
      name: 'invalid manifest',
      code: 'invalid_manifest',
      change: input => ({ ...input, manifest: {} }),
    },
    {
      name: 'empty selection',
      code: 'invalid_selection',
      change: input => ({ ...input, selectedFields: [] }),
    },
    {
      name: 'duplicate selection',
      code: 'invalid_selection',
      change: input => ({ ...input, selectedFields: ['bio', 'bio'] }),
    },
    {
      name: 'invalid target',
      code: 'invalid_target',
      change: input => ({
        ...input,
        target: { ...input.target, destinationAccountId: '' },
      }),
    },
    {
      name: 'invalid clock',
      code: 'invalid_time',
      change: input => ({ ...input, now: 'unknown' }),
    },
    {
      name: 'wrong provider',
      code: 'destination_mismatch',
      change: input => ({
        ...input,
        target: { ...input.target, providerId: 'other' },
      }),
    },
    {
      name: 'wrong readback account',
      code: 'destination_mismatch',
      change: input => ({
        ...input,
        destination: {
          ...input.destination,
          target: { ...input.target, connectorAccountId: 'other' },
        },
      }),
    },
  ];
  it.each([
    [
      'text bounds',
      (m: ArtistProfilePreviewManifest) => {
        if (m.constraints.bio) m.constraints.bio.minLength = 101;
      },
    ],
    [
      'image width bounds',
      (m: ArtistProfilePreviewManifest) => {
        if (m.constraints.image) m.constraints.image.minWidth = 1001;
      },
    ],
    [
      'image height bounds',
      (m: ArtistProfilePreviewManifest) => {
        if (m.constraints.image) m.constraints.image.minHeight = 1001;
      },
    ],
    [
      'terms timestamp',
      (m: ArtistProfilePreviewManifest) => {
        m.termsEvidence['fixture:terms-review'].expiresAt = 'invalid';
      },
    ],
    [
      'unknown rate policy',
      (m: ArtistProfilePreviewManifest) => {
        m.artistProfile.fields.bio.rateLimit = {
          status: 'unknown',
          reason: 'unknown',
        };
      },
    ],
    [
      'unknown confirmation',
      (m: ArtistProfilePreviewManifest) => {
        m.artistProfile.fields.bio.confirmation = {
          status: 'unknown',
          reason: 'unknown',
        };
      },
    ],
    [
      'unknown rollback',
      (m: ArtistProfilePreviewManifest) => {
        m.artistProfile.fields.bio.rollback = {
          mode: 'unknown',
          reason: 'unknown',
        };
      },
    ],
    [
      'unknown evidence',
      (m: ArtistProfilePreviewManifest) => {
        m.artistProfile.fields.bio.evidence = {
          status: 'unknown',
          reason: 'unknown',
        };
      },
    ],
  ] as const)('rejects incoherent manifest: %s', (_name, change) => {
    const input = fixture();
    change(input.manifest);
    const result = blocked(input, 'invalid_manifest');
    expect(
      result.fields.every(field => field.blockers.includes('invalid_manifest'))
    ).toBe(true);
  });
  it.each(blockers)('fails closed for $name', ({ code, change }) => {
    blocked(change(fixture()), code);
  });

  it('refuses every planned DSP destination without inventing executable capabilities', () => {
    for (const destination of Object.values(DSP_PROFILE_CATALOG)) {
      const input = fixture();
      input.manifest.artistProfile = destination.artistProfile;
      const result = blocked(input, 'unsupported_field');
      expect(result.fields).toHaveLength(4);
      expect(
        result.fields.every(field =>
          field.blockers.includes('execution_limits_unknown')
        )
      ).toBe(true);
    }
  });

  it('rejects missing constraints and policies that do not match the destination validation reference', () => {
    const input = fixture();
    delete input.manifest.constraints.bio;
    expect(blocked(input, 'invalid_value').fields[0].validation).toContainEqual(
      { rule: 'constraints_known', valid: false }
    );
    const mismatch = fixture();
    if (mismatch.manifest.constraints.bio)
      mismatch.manifest.constraints.bio.policyRef = 'other-policy';
    blocked(mismatch, 'invalid_value');
  });

  it.each([
    ['utf16', '😀', 2, true],
    ['utf16', '😀', 1, false],
    ['code_points', '😀', 1, true],
    ['utf8_bytes', '😀', 4, true],
    ['utf8_bytes', '😀', 3, false],
  ] as const)(
    'honors destination %s length for %s at %i',
    (unit, bio, maximum, valid) => {
      const input = fixture();
      if (input.manifest.constraints.bio) {
        input.manifest.constraints.bio.lengthUnit = unit;
        input.manifest.constraints.bio.maxLength = maximum;
      }
      expect(previewArtistProfileChanges(value(input, 'bio', bio)).status).toBe(
        valid ? 'confirmable' : 'blocked'
      );
    }
  );
  it.each(['', '   ', 'bio\u0000', 'bio\u007f'])(
    'rejects empty or control-bearing bio %j',
    bio => {
      blocked(value(fixture(), 'bio', bio), 'invalid_value');
    }
  );
  it('allows multiline bios without silent truncation', () => {
    const input = value(fixture(), 'bio', 'First line\nSecond line');
    expect(previewArtistProfileChanges(input).fields[0].outboundValue).toBe(
      'First line\nSecond line'
    );
    expect(previewArtistProfileChanges(input).status).toBe('confirmable');
  });
  it.each(['website', 'bio_link', 'image'] as const)(
    'validates %s protocol, syntax, credentials and length',
    field => {
      const credentialUrl = new URL('https://example.com');
      credentialUrl.username = 'fixture-user';
      credentialUrl.password = 'fixture-password';
      for (const url of [
        'not-a-url',
        'https:example.com',
        'https:/example.com',
        String.raw`https:\example.com`,
        'http://example.com',
        'javascript:alert(1)',
        credentialUrl.href,
        'https://example.com/a b',
        `https://example.com/${'a'.repeat(200)}`,
      ]) {
        blocked(value(fixture(), field, url), 'invalid_value');
      }
    }
  );
  it('applies only the selected destination protocol and transform policy', () => {
    const input = fixture();
    if (input.manifest.constraints.website) {
      input.manifest.constraints.website.allowedProtocols = ['http:'];
      input.manifest.constraints.website.transform = 'trim';
    }
    const result = previewArtistProfileChanges(
      value(input, 'website', '  http://example.com  ')
    );
    expect(result.status).toBe('confirmable');
    expect(result.fields[0].outboundValue).toBe('http://example.com');
    blocked(value(input, 'website', 'https://example.com'), 'invalid_value');
  });
  it('preserves exact URL spelling, query, fragment and identity transformations', () => {
    const input = fixture();
    const url = 'https://EXAMPLE.com/path?ref=one#bio';
    const result = previewArtistProfileChanges(value(input, 'website', url));
    expect(result.status).toBe('confirmable');
    expect(result.fields[0].outboundValue).toBe(url);
    const constraints = input.manifest.constraints.bio;
    if (constraints) constraints.transform = 'identity';
    expect(previewArtistProfileChanges(input).fields[0].outboundValue).toBe(
      '  New bio  '
    );
  });
  it.each([
    { mimeType: 'image/gif' },
    { bytes: 5001 },
    { width: 99 },
    { height: 99 },
    { width: 1001 },
    { height: 1001 },
    { bytes: 0 },
    { width: 1.5 },
    { value: 'https://example.com/other.png' },
    { evidenceRef: 'not-verified' },
  ])('rejects invalid image metadata %j', patch => {
    const input = fixture();
    blocked(
      { ...input, imageEvidence: { ...input.imageEvidence, ...patch } },
      'invalid_value'
    );
  });
  it.each(['10/16/2026', '2026-10-16'])(
    'requires an unambiguous timestamp %s',
    now => {
      blocked({ ...fixture(), now }, 'invalid_time');
    }
  );
  it('requires image metadata without fetching the asset', () => {
    blocked({ ...fixture(), imageEvidence: undefined }, 'invalid_value');
  });

  it('allows known unsupported rollback with an explicit warning and no assumed read', () => {
    const input = fixture();
    for (const field of ARTIST_PROFILE_FIELDS) {
      const policy = input.manifest.artistProfile.fields[field];
      policy.read = 'unsupported';
      policy.authorization.read = {
        status: 'unsupported',
        reason: 'no read endpoint',
      };
      policy.rollback = { mode: 'unsupported', reason: 'no restore endpoint' };
    }
    const result = previewArtistProfileChanges(input);
    expect(result.status).toBe('confirmable');
    expect(
      result.fields.every(
        field =>
          field.destination === null &&
          field.warnings.includes('rollback_unsupported')
      )
    ).toBe(true);
  });
  it('handles public reads, nullable before-values and compensating writes', () => {
    const input = fixture();
    input.manifest.artistProfile.fields.bio.authorization.read = {
      status: 'public',
      resource: 'artist',
      evidenceRef: 'fixture:ownership',
    };
    input.manifest.artistProfile.fields.bio.rollback = {
      mode: 'compensating_write',
      policyRef: 'fixture:rollback',
      evidenceRef: 'fixture:restore-test',
    };
    const result = previewArtistProfileChanges({
      ...input,
      selectedFields: ['bio'],
      destination: {
        ...input.destination,
        fields: { bio: { value: null, version: 'v2', observedAt: input.now } },
      },
    });
    expect(result.status).toBe('confirmable');
    expect(result.fields[0].destination?.value).toBeNull();
    expect(result.fields[0].warnings).toContain(
      'rollback_requires_compensating_write'
    );
  });
  it('honors owner-or-manager authorization only for the exact target', () => {
    const input = fixture();
    for (const field of ARTIST_PROFILE_FIELDS) {
      const auth = input.manifest.artistProfile.fields[field].authorization;
      if (auth.write.status === 'verified')
        auth.write.requiredRole = 'owner_or_manager';
      if (auth.read.status === 'verified')
        auth.read.requiredRole = 'owner_or_manager';
    }
    expect(
      previewArtistProfileChanges({
        ...input,
        authorization: { ...input.authorization, role: 'manager' },
      }).status
    ).toBe('confirmable');
  });
  it.each(['future', 'invalid', 'versionless'] as const)(
    'refuses %s read observations for snapshot restore',
    kind => {
      const input = fixture();
      blocked(
        {
          ...input,
          selectedFields: ['bio'],
          destination: {
            ...input.destination,
            fields: {
              bio: {
                value: 'before',
                version: kind === 'versionless' ? '' : 'v1',
                observedAt:
                  kind === 'future'
                    ? '2026-12-01T00:00:00Z'
                    : kind === 'invalid'
                      ? 'invalid'
                      : input.now,
              },
            },
          },
        },
        'rollback_snapshot_missing'
      );
    }
  );

  it('is stable for repeated inputs, selected-field order and object-key insertion order', () => {
    const input = fixture();
    const checksum = previewArtistProfileChanges(input).checksum;
    expect(checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(previewArtistProfileChanges(structuredClone(input)).checksum).toBe(
      checksum
    );
    expect(
      previewArtistProfileChanges({
        ...input,
        selectedFields: [...input.selectedFields].reverse(),
        target: {
          destinationAccountId: input.target.destinationAccountId,
          connectorAccountId: input.target.connectorAccountId,
          providerId: input.target.providerId,
        },
      }).checksum
    ).toBe(checksum);
    // Moving the explicit clock inside the same evidence window is not a plan change.
    expect(
      previewArtistProfileChanges({ ...input, now: '2026-10-17T00:00:00Z' })
        .checksum
    ).toBe(checksum);
  });
  it('binds revision, manifest version and content, every account selector, selected fields and exact values', () => {
    const input = fixture();
    const checksum = previewArtistProfileChanges(input).checksum;
    const variants: ArtistProfilePreviewInput[] = [
      { ...input, snapshot: { ...input.snapshot, revision: 'revision-2' } },
      { ...input, snapshot: { ...input.snapshot, profileId: 'profile-2' } },
      { ...input, manifest: { ...input.manifest, version: '2' } },
      {
        ...input,
        manifest: {
          ...input.manifest,
          execution: { status: 'documented', timeoutMs: 6000, maxAttempts: 2 },
        },
      },
      {
        ...input,
        target: { ...input.target, connectorAccountId: 'connection-2' },
      },
      {
        ...input,
        target: { ...input.target, destinationAccountId: 'artist-2' },
      },
      { ...input, target: { ...input.target, providerId: 'provider-2' } },
      { ...input, selectedFields: ['bio'] },
      {
        ...value(input, 'bio', 'different bio'),
        selectedFields: input.selectedFields,
      },
      { ...input, imageEvidence: { ...input.imageEvidence, width: 200 } },
      {
        ...input,
        destination: {
          ...input.destination,
          fields: {
            ...input.destination.fields,
            bio: {
              value: 'changed before',
              version: 'v2',
              observedAt: input.now,
            },
          },
        },
      },
    ];
    for (const variant of variants)
      expect(previewArtistProfileChanges(variant).checksum).not.toBe(checksum);
    const exact = value(input, 'website', 'https://EXAMPLE.com/');
    expect(previewArtistProfileChanges(exact).checksum).not.toBe(
      previewArtistProfileChanges(
        value(input, 'website', 'https://example.com/')
      ).checksum
    );
  });
});
