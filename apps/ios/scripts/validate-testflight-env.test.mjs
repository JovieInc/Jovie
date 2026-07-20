import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const scriptPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'validate-testflight-env.sh'
);

const validEnv = {
  PATH: process.env.PATH,
  APPLE_API_KEY: 'private-key',
  APPLE_API_KEY_ID: 'key-id',
  APPLE_API_ISSUER: 'issuer-id',
  APPLE_TEAM_ID: 'team-id',
  MATCH_GIT_URL: 'git@example.com:signing.git',
  MATCH_PASSWORD: 'password',
  MATCH_GIT_BASIC_AUTHORIZATION: 'authorization',
  CLERK_ASSOCIATED_DOMAIN: 'accounts.jov.ie',
};

function runValidator(env) {
  return execFileSync('bash', [scriptPath], {
    env,
    encoding: 'utf8',
  });
}

test('accepts the Better Auth release contract without a Clerk client key', () => {
  const output = runValidator(validEnv);
  assert.match(output, /Validated TestFlight release configuration/);
});

test('still requires the associated domain used by the Apple entitlement', () => {
  const { CLERK_ASSOCIATED_DOMAIN: _removed, ...missingDomainEnv } = validEnv;
  assert.throws(
    () => runValidator(missingDomainEnv),
    error => {
      assert.match(
        `${error.stdout ?? ''}${error.stderr ?? ''}`,
        /Missing required secret or env var: CLERK_ASSOCIATED_DOMAIN/
      );
      return true;
    }
  );
});
