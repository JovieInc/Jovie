import { oauthProvider } from '@better-auth/oauth-provider';
import { getTableColumns } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import {
  baOauthAccessTokens,
  baOauthClients,
  baOauthConsents,
  baOauthRefreshTokens,
} from '@/lib/db/schema/better-auth';

/**
 * JOV-4587: Better Auth's oauth-provider writes every field in its pinned
 * schema through the Drizzle adapter. A missing mapped column fails
 * `/oauth2/token` after Apple returns a valid code (production symptom:
 * "fields including authorizationCodeId are missing from the mapped
 * oauthRefreshToken / oauthAccessToken schema").
 *
 * Derive the field set from the installed package at test time so a provider
 * bump that adds columns fails CI before production token exchange breaks.
 */
const MAPPED_OAUTH_MODELS = {
  oauthClient: baOauthClients,
  oauthRefreshToken: baOauthRefreshTokens,
  oauthAccessToken: baOauthAccessTokens,
  oauthConsent: baOauthConsents,
} as const;

type MappedOAuthModel = keyof typeof MAPPED_OAUTH_MODELS;

function providerFieldNames(model: MappedOAuthModel): string[] {
  const plugin = oauthProvider({
    loginPage: '/identity',
    consentPage: '/identity',
  });
  const modelSchema = plugin.schema?.[model];
  if (!modelSchema?.fields) {
    throw new Error(
      `Pinned @better-auth/oauth-provider has no schema fields for ${model}`
    );
  }
  return Object.keys(modelSchema.fields).sort();
}

function drizzleFieldNames(
  table: (typeof MAPPED_OAUTH_MODELS)[MappedOAuthModel]
): string[] {
  // Better Auth adds an implicit `id` primary key; it is not listed in the
  // plugin field map. Exclude it when comparing provider field coverage.
  return Object.keys(getTableColumns(table))
    .filter(name => name !== 'id')
    .sort();
}

describe('OAuth provider schema contract (JOV-4587)', () => {
  it.each(
    Object.keys(MAPPED_OAUTH_MODELS) as MappedOAuthModel[]
  )('maps every %s field declared by the pinned oauth-provider', model => {
    const required = providerFieldNames(model);
    const mapped = drizzleFieldNames(MAPPED_OAUTH_MODELS[model]);
    const missing = required.filter(field => !mapped.includes(field));

    expect(
      missing,
      `Drizzle table for ${model} is missing provider fields: ${missing.join(', ')}. Expand apps/web/lib/db/schema/better-auth.ts and generate a migration.`
    ).toEqual([]);
  });

  it('covers the four oauth models required by token exchange', () => {
    const plugin = oauthProvider({
      loginPage: '/identity',
      consentPage: '/identity',
    });
    const providerModels = Object.keys(plugin.schema ?? {});

    for (const model of Object.keys(MAPPED_OAUTH_MODELS)) {
      expect(providerModels).toContain(model);
    }
  });
});
