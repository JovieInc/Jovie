import {
  ARTIST_PROFILE_FIELDS,
  type ArtistProfileContract,
  type ArtistProfileField,
  artistProfileContractSchema,
} from './artist-profile-contract';
import {
  ARTIST_PROFILE_DESTINATIONS,
  type ArtistProfileDestinationManifest,
} from './artist-profile-registry';

type FieldPolicy = ArtistProfileContract['fields'][ArtistProfileField];

function freshness(evidence: FieldPolicy['evidence'], now: number) {
  if (evidence.status !== 'documented') return 'missing' as const;
  const verified = Date.parse(evidence.verifiedAt ?? '');
  const expires = Date.parse(evidence.expiresAt ?? '');
  if (!Number.isFinite(verified) || !Number.isFinite(expires))
    return 'undated' as const;
  if (verified > now || expires <= verified || !Number.isFinite(now))
    return 'invalid' as const;
  return expires > now ? ('fresh' as const) : ('stale' as const);
}

function authorizationLabel(policy: FieldPolicy['authorization']['read']) {
  if (policy.status === 'verified')
    return `OAuth: ${policy.requiredRole}; ${policy.requiredScopes.join(', ')}`;
  return policy.status === 'public' ? 'Public read' : policy.reason;
}

/** Pure projection of validated code manifests. Never accepts account data. */
export function projectArtistProfileDestination(
  id: string,
  manifest: ArtistProfileDestinationManifest,
  now = new Date()
) {
  const profile = artistProfileContractSchema.parse(manifest.profile);
  const fields = ARTIST_PROFILE_FIELDS.map(name => {
    const policy = profile.fields[name];
    const evidenceFreshness = freshness(policy.evidence, now.getTime());
    const operation = (mode: 'read' | 'write') => {
      let blockingReason: string | null = null;
      if (manifest.rollout !== 'available')
        blockingReason = `Destination rollout is ${manifest.rollout}.`;
      else if (policy[mode] !== 'supported')
        blockingReason = `${mode} support is ${policy[mode]}.`;
      else if (evidenceFreshness !== 'fresh')
        blockingReason = `Operation evidence is ${evidenceFreshness}.`;
      else if (
        mode === 'write' &&
        !['snapshot_restore', 'compensating_write'].includes(
          policy.rollback.mode
        )
      )
        blockingReason = 'A verified rollback path is required.';
      return {
        support: policy[mode],
        available: blockingReason === null,
        blockingReason,
      };
    };
    return {
      name,
      read: operation('read'),
      write: operation('write'),
      authorization: {
        read: {
          ...policy.authorization.read,
          label: authorizationLabel(policy.authorization.read),
        },
        write: {
          ...policy.authorization.write,
          label: authorizationLabel(policy.authorization.write),
        },
      },
      constraints: {
        ...manifest.constraints[name],
        validation: policy.validation,
      },
      preview: policy.preview,
      confirmation: policy.confirmation,
      rateLimit: policy.rateLimit,
      audit: policy.audit,
      rollback: policy.rollback,
      recovery: manifest.recovery,
      termsApi: policy.termsApi,
      evidence: { ...policy.evidence, freshness: evidenceFreshness },
      documentation: manifest.documentation
        ? {
            field: manifest.documentation.apiFields[name],
            authorization: manifest.documentation.authorization,
            rateLimit: manifest.documentation.quota,
            termsApi: manifest.documentation.termsApi,
            evidence: manifest.documentation.evidence,
          }
        : null,
    };
  });
  return {
    id,
    label: manifest.label,
    aliases: [...(manifest.aliases ?? [])],
    sources: [...manifest.sources],
    rollout: manifest.rollout,
    fields,
  };
}

/** Read on demand: evidence expiry must not be frozen into a module or static page. */
export function getArtistProfileCatalog(now = new Date()) {
  return {
    schema: 'jovie-artist-profile-catalog/v1' as const,
    observedAt: now.toISOString(),
    destinations: Object.entries(ARTIST_PROFILE_DESTINATIONS).map(
      ([id, manifest]) => projectArtistProfileDestination(id, manifest, now)
    ),
  };
}
