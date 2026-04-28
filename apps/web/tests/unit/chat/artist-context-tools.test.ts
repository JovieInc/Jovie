/**
 * Tenant-isolation regression tests for the artist-data lookup tools.
 *
 * The four `lookup*` tools must take `profileId` from a closure
 * argument — never from a Zod-schema field the model can supply. If a
 * future PR accidentally moves `profileId` into the schema, the model
 * could request another user's data by hallucinating a profileId.
 *
 * These tests assert the schema explicitly REJECTS those identity
 * fields so the regression is caught at PR time, not in production.
 */

import { describe, expect, it } from 'vitest';

import {
  buildArtistContextTools,
  createLookupCatalogHealthTool,
  createLookupFanSnapshotTool,
  createLookupLinkAnalyticsTool,
  createLookupRecentReleasesTool,
  LOOKUP_TOOL_NAMES,
} from '@/lib/ai/tools/artist-context';

const FORBIDDEN_FIELDS = [
  'profileId',
  'userId',
  'profile_id',
  'user_id',
  'creatorProfileId',
  'creator_profile_id',
  'clerkUserId',
  'clerk_user_id',
] as const;

interface ToolWithSchema {
  inputSchema?: { safeParse: (data: unknown) => { success: boolean } };
}

function assertSchemaRejectsIdentityFields(
  toolName: string,
  tool: ToolWithSchema
): void {
  const schema = tool.inputSchema;
  if (!schema || typeof schema.safeParse !== 'function') {
    throw new Error(
      `${toolName} has no inputSchema — every lookup tool must validate inputs.`
    );
  }

  for (const forbidden of FORBIDDEN_FIELDS) {
    const probe = { [forbidden]: 'pretend-id' } as Record<string, string>;
    const result = schema.safeParse(probe);
    if (result.success) {
      throw new Error(
        `${toolName} input schema accepts '${forbidden}' — tenant isolation hole. ` +
          'Identity must be closure-captured, not model-supplied.'
      );
    }
  }
}

describe('artist-context lookup tools — tenant isolation', () => {
  it('exposes the expected 4 tool names', () => {
    expect(LOOKUP_TOOL_NAMES).toEqual([
      'lookupRecentReleases',
      'lookupCatalogHealth',
      'lookupFanSnapshot',
      'lookupLinkAnalytics',
    ]);
  });

  it('lookupRecentReleases input schema rejects every identity field', () => {
    const tool = createLookupRecentReleasesTool('profile-1');
    assertSchemaRejectsIdentityFields('lookupRecentReleases', tool);
  });

  it('lookupCatalogHealth input schema rejects every identity field', () => {
    const tool = createLookupCatalogHealthTool('profile-1');
    assertSchemaRejectsIdentityFields('lookupCatalogHealth', tool);
  });

  it('lookupFanSnapshot input schema rejects every identity field', () => {
    const tool = createLookupFanSnapshotTool('profile-1');
    assertSchemaRejectsIdentityFields('lookupFanSnapshot', tool);
  });

  it('lookupLinkAnalytics input schema rejects every identity field', () => {
    const tool = createLookupLinkAnalyticsTool('profile-1');
    assertSchemaRejectsIdentityFields('lookupLinkAnalytics', tool);
  });

  it('returns no_profile when invoked without a bound profileId (null closure)', async () => {
    const tools = buildArtistContextTools(null);
    const tool = tools.lookupRecentReleases;
    const out = await (
      tool as unknown as { execute: (args: unknown) => unknown }
    ).execute({});
    expect(out).toMatchObject({ error: 'no_profile' });
  });

  it('buildArtistContextTools returns the full set when profileId is provided', () => {
    const tools = buildArtistContextTools('profile-1');
    expect(Object.keys(tools).sort()).toEqual([
      'lookupCatalogHealth',
      'lookupFanSnapshot',
      'lookupLinkAnalytics',
      'lookupRecentReleases',
    ]);
  });
});
