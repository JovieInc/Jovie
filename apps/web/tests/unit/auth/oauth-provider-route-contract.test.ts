import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(process.cwd(), '../..');
const identityRoute = path.join(
  repoRoot,
  'apps/web/app/(auth)/identity/page.tsx'
);
const betterAuthConfig = path.join(
  repoRoot,
  'apps/web/lib/auth/better-auth.ts'
);

/**
 * The OAuth provider redirects its login, consent, and signup prompts to a
 * product-owned page. Keep the provider configuration and the Next route
 * coupled so a deployment cannot silently turn the native flow into a 404.
 */
describe('OAuth provider auth-page route contract', () => {
  it('implements every configured OAuth prompt path', async () => {
    const [routeSource, authSource] = await Promise.all([
      readFile(identityRoute, 'utf8'),
      readFile(betterAuthConfig, 'utf8'),
    ]);

    expect(routeSource).toContain('export default function IdentityPage');
    expect(routeSource).toContain("export const dynamic = 'force-dynamic'");

    const configuredPages = [
      authSource.match(/loginPage:\s*'([^']+)'/)?.[1],
      authSource.match(/consentPage:\s*'([^']+)'/)?.[1],
      authSource.match(/signup:\s*\{\s*page:\s*'([^']+)'/)?.[1],
    ];

    expect(configuredPages).toEqual(['/identity', '/identity', '/identity']);
  });
});
