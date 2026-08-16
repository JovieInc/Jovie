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
};

function runValidator(env) {
  return execFileSync('bash', [scriptPath], {
    env,
    encoding: 'utf8',
  });
}

test('accepts the Better Auth release contract', () => {
  const output = runValidator(validEnv);
  assert.match(output, /Validated TestFlight release configuration/);
});
