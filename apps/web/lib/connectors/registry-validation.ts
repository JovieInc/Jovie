import { z } from 'zod';
import {
  ARTIST_PROFILE_FIELDS,
  artistProfileContractSchema,
} from './artist-profile-contract';
import { CONNECTOR_PROVIDER_IDS, type ConnectorDefinition } from './types';

export const connectorDefinitionSchema = z
  .strictObject({
    id: z.enum(CONNECTOR_PROVIDER_IDS),
    label: z.string().min(1),
    description: z.string().min(1),
    iconKey: z.enum(['mail', 'calendar', 'spotify', 'youtube']),
    oauthBundle: z.enum(['google', 'spotify', 'youtube']),
    oauthScopes: z.array(z.string().trim().min(1)).readonly(),
    oauthScopeLabels: z.array(z.string().min(1)).readonly(),
    tokenHandler: z.literal('shared_token_vault'),
    syncRunner: z.enum(CONNECTOR_PROVIDER_IDS).nullable(),
    webhookHandler: z.string().min(1).nullable(),
    displayOrder: z.number().int().positive(),
    capabilities: z
      .array(
        z.strictObject({
          id: z.string().min(1),
          label: z.string().min(1),
          mode: z.enum(['read', 'write']),
          requiredScopes: z.array(z.string()).readonly(),
          requiresApproval: z.boolean(),
          availability: z.enum(['available', 'planned', 'blocked']),
        })
      )
      .readonly(),
    accountScope: z.enum(['user', 'identity']),
    artistProfile: artistProfileContractSchema.nullable(),
    platforms: z.array(z.enum(['web', 'mac', 'ios'])).readonly(),
  })
  .superRefine((definition, ctx) => {
    if (!definition.artistProfile) return;
    for (const name of ARTIST_PROFILE_FIELDS) {
      const field = definition.artistProfile.fields[name];
      for (const mode of ['read', 'write'] as const) {
        const authorization = field.authorization[mode];
        if (authorization.status !== 'verified') continue;
        if (
          !authorization.requiredScopes.every(scope =>
            definition.oauthScopes.includes(scope)
          )
        ) {
          ctx.addIssue({
            code: 'custom',
            path: [
              'artistProfile',
              'fields',
              name,
              'authorization',
              mode,
              'requiredScopes',
            ],
            message:
              'Profile scopes must be requested by the existing connector',
          });
        }
      }
    }
  }) satisfies z.ZodType<ConnectorDefinition>;

export const connectorRegistrySchema = z
  .record(z.enum(CONNECTOR_PROVIDER_IDS), connectorDefinitionSchema)
  .superRefine((registry, ctx) => {
    for (const id of CONNECTOR_PROVIDER_IDS) {
      if (registry[id].id !== id)
        ctx.addIssue({
          code: 'custom',
          path: [id, 'id'],
          message: 'Registry key must match provider id',
        });
    }
  });

/** Retain literal manifest types while validating all entries on module load. */
export function validateConnectorRegistry<
  T extends Readonly<
    Record<(typeof CONNECTOR_PROVIDER_IDS)[number], ConnectorDefinition>
  >,
>(registry: T): T {
  connectorRegistrySchema.parse(registry);
  return registry;
}
