import { betterAuth } from 'better-auth';
import { getTableColumns } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { apiKeys } from '@/lib/db/schema/api-keys';
import { agentApiKeyPlugin } from './api-key-plugin';

async function harness() {
  const auth = betterAuth({
    baseURL: 'https://auth.test',
    secret: 'test-only-secret-at-least-thirty-two-characters',
    emailAndPassword: { enabled: true },
    logger: { disabled: true },
    rateLimit: { enabled: false },
    telemetry: { enabled: false },
    plugins: [agentApiKeyPlugin()],
  });
  const signedIn = await auth.api.signUpEmail({
    body: {
      name: 'Artist',
      email: 'keys@example.com',
      password: 'test-only-password-123',
    },
    returnHeaders: true,
  });
  const headers = new Headers({
    cookie: signedIn.headers
      .getSetCookie()
      .map(value => value.split(';')[0])
      .join('; '),
  });
  return { auth, headers, userId: signedIn.response.user.id };
}

describe('agent API key lifecycle', () => {
  it('mints once, stores only a hash, lists without the key, verifies and revokes', async () => {
    const { auth, headers, userId } = await harness();
    const key = await auth.api.createApiKey({
      body: { name: 'Build agent' },
      headers,
    });
    expect(key.key).toMatch(/^jovie_/);
    expect(key.expiresAt?.getTime()).toBeGreaterThan(Date.now());
    const context = await auth.$context;
    const stored = await context.adapter.findOne<{
      key: string;
      referenceId: string;
    }>({ model: 'apikey', where: [{ field: 'id', value: key.id }] });
    expect(stored?.key).not.toBe(key.key);
    expect(stored?.referenceId).toBe(userId);
    expect(
      await auth.api.verifyApiKey({ body: { key: key.key } })
    ).toMatchObject({ valid: true, key: { referenceId: userId } });
    const listed = await auth.api.listApiKeys({ headers });
    expect(listed.apiKeys).toHaveLength(1);
    expect(JSON.stringify(listed)).not.toContain(key.key);
    expect(JSON.stringify(listed)).not.toContain(stored?.key);
    await auth.api.deleteApiKey({ body: { keyId: key.id }, headers });
    expect(
      await auth.api.verifyApiKey({ body: { key: key.key } })
    ).toMatchObject({ valid: false });
    expect((await auth.api.listApiKeys({ headers })).apiKeys).toHaveLength(0);
  });

  it('requires a session for key management and never turns a key into a session', async () => {
    const { auth, headers } = await harness();
    const key = await auth.api.createApiKey({
      body: { name: 'Agent' },
      headers,
    });
    const anonymous = await auth.handler(
      new Request('https://auth.test/api/auth/api-key/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Agent' }),
      })
    );
    expect(anonymous.status).toBe(401);
    expect(
      await auth.api.getSession({
        headers: new Headers({ 'x-api-key': key.key }),
      })
    ).toBeNull();
    await expect(
      auth.api.deleteApiKey({
        body: { keyId: key.id },
        headers: new Headers({ 'x-api-key': key.key }),
      })
    ).rejects.toThrow();
  });

  it('prevents another signed-in account from revoking a key', async () => {
    const { auth, headers } = await harness();
    const key = await auth.api.createApiKey({
      body: { name: 'Agent' },
      headers,
    });
    const other = await auth.api.signUpEmail({
      body: {
        name: 'Other',
        email: 'other@example.com',
        password: 'test-only-password-123',
      },
      returnHeaders: true,
    });
    const otherHeaders = new Headers({
      cookie: other.headers
        .getSetCookie()
        .map(value => value.split(';')[0])
        .join('; '),
    });
    expect(
      (await auth.api.listApiKeys({ headers: otherHeaders })).apiKeys
    ).toHaveLength(0);
    await expect(
      auth.api.deleteApiKey({ body: { keyId: key.id }, headers: otherHeaders })
    ).rejects.toThrow();
    expect(
      (await auth.api.verifyApiKey({ body: { key: key.key } })).valid
    ).toBe(true);
  });

  it('rejects expired keys and maps every pinned provider field to Drizzle', async () => {
    const { auth, headers } = await harness();
    const key = await auth.api.createApiKey({
      body: { name: 'Agent' },
      headers,
    });
    const context = await auth.$context;
    await context.adapter.update({
      model: 'apikey',
      where: [{ field: 'id', value: key.id }],
      update: { expiresAt: new Date(0) },
    });
    expect(
      (await auth.api.verifyApiKey({ body: { key: key.key } })).valid
    ).toBe(false);
    const fields = Object.keys(agentApiKeyPlugin().schema.apikey.fields);
    expect(
      fields.filter(field => !(field in getTableColumns(apiKeys)))
    ).toEqual([]);
  });
});
