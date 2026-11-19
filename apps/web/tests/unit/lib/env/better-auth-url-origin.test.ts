import { afterEach, describe, expect, it, vi } from 'vitest';
import { env } from '@/lib/env-server';
import { ServerEnvSchema } from '@/lib/env-server-schema';
import { __test__ } from '@/lib/env-validation-rules';

const { checkBetterAuthUrlOrigin } = __test__;

function runRule(input: {
  readonly betterAuthUrl?: string;
  readonly publicBetterAuthUrl?: string;
  readonly vercelEnv: string;
  readonly appUrl?: string;
  readonly profileHostname?: string;
  readonly vercelUrl?: string;
  readonly vercelBranchUrl?: string;
}) {
  vi.stubEnv('BETTER_AUTH_URL', input.betterAuthUrl);
  vi.stubEnv('NEXT_PUBLIC_BETTER_AUTH_URL', input.publicBetterAuthUrl);
  vi.stubEnv('NEXT_PUBLIC_APP_URL', input.appUrl);
  vi.stubEnv('NEXT_PUBLIC_PROFILE_HOSTNAME', input.profileHostname);
  vi.stubEnv('VERCEL_URL', input.vercelUrl);
  vi.stubEnv('VERCEL_BRANCH_URL', input.vercelBranchUrl);

  return checkBetterAuthUrlOrigin({ server: env, vercelEnv: input.vercelEnv });
}

describe('checkBetterAuthUrlOrigin', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('rejects production host when running locally', () => {
    const issue = runRule({
      betterAuthUrl: 'https://jov.ie',
      vercelEnv: 'development',
    });
    expect(issue?.type).toBe('critical');
    expect(issue?.message).toMatch(/must be local/i);
    expect(issue?.message).not.toMatch(/sk_|secret|password/i);
  });

  it('rejects staging host when production is expected', () => {
    const issue = runRule({
      betterAuthUrl: 'https://staging.jov.ie',
      publicBetterAuthUrl: 'https://staging.jov.ie',
      appUrl: 'https://staging.jov.ie',
      profileHostname: 'staging.jov.ie',
      vercelEnv: 'production',
    });
    expect(issue?.type).toBe('critical');
    expect(issue?.message).toMatch(/must be production/i);
  });

  it.each([
    { appUrl: 'https://staging.jov.ie' },
    { profileHostname: 'staging.jov.ie' },
  ])('rejects production auth on staging with %j', staging => {
    const issue = runRule({
      betterAuthUrl: 'https://jov.ie',
      publicBetterAuthUrl: 'https://jov.ie',
      vercelEnv: 'preview',
      ...staging,
    });
    expect(issue?.type).toBe('critical');
    expect(issue?.message).toMatch(/must be staging/i);
  });

  it('accepts the staging auth origin on the staging preview when the public app URL falls back to production', () => {
    const issue = runRule({
      betterAuthUrl: 'https://staging.jov.ie',
      publicBetterAuthUrl: 'https://staging.jov.ie',
      vercelEnv: 'preview',
      profileHostname: 'staging.jov.ie',
      vercelUrl: 'jovie-preview-abc.vercel.app',
    });
    expect(issue).toBeNull();
  });

  it('rejects the staging auth origin on an ordinary preview', () => {
    const issue = runRule({
      betterAuthUrl: 'https://staging.jov.ie',
      vercelEnv: 'preview',
      profileHostname: 'staging.jov.ie.example.com',
      vercelUrl: 'jovie-preview-abc.vercel.app',
    });
    expect(issue?.type).toBe('critical');
    expect(issue?.message).toMatch(/not allowed/i);
  });

  it('accepts matching production hosts', () => {
    const issue = runRule({
      betterAuthUrl: 'https://jov.ie',
      publicBetterAuthUrl: 'https://jov.ie',
      vercelEnv: 'production',
    });
    expect(issue).toBeNull();
  });

  it('accepts local hosts', () => {
    const issue = runRule({
      betterAuthUrl: 'http://localhost:3100',
      publicBetterAuthUrl: 'http://localhost:3100',
      vercelEnv: 'development',
    });
    expect(issue).toBeNull();
  });

  it('rejects mismatched server vs public hosts', () => {
    const issue = runRule({
      betterAuthUrl: 'https://jov.ie',
      publicBetterAuthUrl: 'https://www.jov.ie',
      vercelEnv: 'production',
    });
    expect(issue?.type).toBe('critical');
    expect(issue?.message).toMatch(/must match/i);
  });

  it('rejects cross-env public host before host-pair check', () => {
    const issue = runRule({
      betterAuthUrl: 'https://jov.ie',
      publicBetterAuthUrl: 'https://staging.jov.ie',
      vercelEnv: 'production',
    });
    expect(issue?.type).toBe('critical');
    expect(issue?.message).toMatch(/must be production/i);
  });

  it('accepts the exact Vercel deployment host in preview', () => {
    const issue = runRule({
      betterAuthUrl: 'https://jovie-preview-abc.vercel.app',
      publicBetterAuthUrl: 'https://jovie-preview-abc.vercel.app',
      vercelEnv: 'preview',
      vercelUrl: 'jovie-preview-abc.vercel.app',
    });
    expect(issue).toBeNull();
  });

  it('accepts the exact Vercel branch host in preview', () => {
    const issue = runRule({
      betterAuthUrl: 'https://jovie-git-auth-jovie.vercel.app',
      publicBetterAuthUrl: 'https://jovie-git-auth-jovie.vercel.app',
      vercelEnv: 'preview',
      vercelUrl: 'jovie-preview-abc.vercel.app',
      vercelBranchUrl: 'jovie-git-auth-jovie.vercel.app',
    });
    expect(issue).toBeNull();
  });

  it('rejects arbitrary Vercel hosts in preview', () => {
    const issue = runRule({
      betterAuthUrl: 'https://attacker-project.vercel.app',
      publicBetterAuthUrl: 'https://attacker-project.vercel.app',
      vercelEnv: 'preview',
      vercelUrl: 'jovie-preview-abc.vercel.app',
      vercelBranchUrl: 'jovie-git-auth-jovie.vercel.app',
    });
    expect(issue?.type).toBe('critical');
    expect(issue?.message).toMatch(/not allowed/i);
  });
});

describe('VERCEL_BRANCH_URL schema', () => {
  it('accepts a Vercel hostname without a scheme', () => {
    const result = ServerEnvSchema.safeParse({
      VERCEL_BRANCH_URL: 'jovie-git-auth-jovie.vercel.app',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a URL with a scheme', () => {
    const result = ServerEnvSchema.safeParse({
      VERCEL_BRANCH_URL: 'https://jovie-git-auth-jovie.vercel.app',
    });
    expect(result.success).toBe(false);
  });
});
