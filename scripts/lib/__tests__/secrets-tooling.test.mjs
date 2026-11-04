import { expect, it } from 'vitest';
import { MARK, redact } from '../../secrets/redact.mjs';
import {
  formatPresence,
  presenceFromEnv,
  presenceFromNames,
} from '../../secrets/secret-present.mjs';
import {
  lintGithubEnvironment,
  lintTokenAges,
  lintVercelEnv,
  summarize,
} from '../secrets-metadata-lint.mjs';

// Fixtures are assembled at runtime so no literal secret-shaped string is committed.
const fake = (prefix, n, ch = 'a') => prefix + ch.repeat(n);

it('redact masks token shapes, URL credentials, bearer and assignments', () => {
  const samples = [
    fake('ghp_', 36),
    fake('lin_oauth_', 40),
    fake('lin_api_', 40),
    fake('vck_', 30),
    fake('sk-', 30),
    fake('whsec_', 24),
    fake('dp.ct.', 30),
  ];
  for (const s of samples) {
    const out = redact(`token ${s} end`);
    expect(out.includes(s)).toBe(false);
    expect(out).toMatch(/\[REDACTED\]/);
  }
  expect(redact('postgres://user:' + 'p4ssw0rd-long' + '@host/db')).toBe(
    `postgres://user:${MARK}@host/db`
  );
  expect(redact('Authorization: Bearer ' + 'x'.repeat(30))).toMatch(
    /Bearer \[REDACTED\]/
  );
  expect(redact('STRIPE_SECRET_KEY=' + 'z'.repeat(20))).toBe(
    `STRIPE_SECRET_KEY=${MARK}`
  );
  const pem =
    '-----BEGIN ' + 'PRIVATE KEY-----\nabc\n-----END ' + 'PRIVATE KEY-----';
  expect(redact(pem)).toBe(MARK);
});

it('redact leaves ordinary text and key names alone', () => {
  const text =
    'doppler secrets --only-names AI_GATEWAY_API_KEY set\nNEXT_PUBLIC_APP_URL=https://jov.ie';
  expect(redact(text)).toBe(text);
});

it('presence reports set/unset without exposing values', () => {
  const env = { A_KEY: 'value-123', EMPTY: '' };
  const rows = presenceFromEnv(['A_KEY', 'EMPTY', 'MISSING'], env);
  expect(formatPresence(rows)).toBe('A_KEY set\nEMPTY unset\nMISSING unset');
  expect(JSON.stringify(rows).includes('value-123')).toBe(false);
  expect(presenceFromNames(['X', 'Y'], ['X']).map(r => r.set)).toEqual([
    true,
    false,
  ]);
});

it('lintVercelEnv: new NEXT_PUBLIC_ secret is an error, baselined is a warning', () => {
  const records = [
    { key: 'NEXT_PUBLIC_OLD', type: 'sensitive', target: ['production'] },
    { key: 'NEXT_PUBLIC_NEW', type: 'sensitive', target: ['production'] },
    { key: 'NEXT_PUBLIC_OK', type: 'encrypted', target: ['production'] },
    { key: 'STRIPE_SECRET_KEY', type: 'sensitive', target: ['production'] },
    { key: 'UPSTASH_REST_TOKEN', type: 'encrypted', target: ['production'] },
  ];
  const f = lintVercelEnv(records, {
    project: 'jovie',
    baselinePublicSecretKeys: ['NEXT_PUBLIC_OLD'],
  });
  const by = Object.fromEntries(f.map(x => [x.subject, x]));
  expect(by['vercel:jovie:NEXT_PUBLIC_OLD'].severity).toBe('warn');
  expect(by['vercel:jovie:NEXT_PUBLIC_NEW'].severity).toBe('error');
  expect(by['vercel:jovie:UPSTASH_REST_TOKEN'].rule).toBe('secret-readable');
  expect(by['vercel:jovie:NEXT_PUBLIC_OK']).toBe(undefined);
  expect(by['vercel:jovie:STRIPE_SECRET_KEY']).toBe(undefined);
  expect(summarize(f)).toEqual({ errors: 1, warnings: 2 });
});

it('lintGithubEnvironment flags drift and a missing branch policy', () => {
  const f = lintGithubEnvironment({
    environment: 'Production \u2013 jovie',
    secretNames: ['A', 'B', 'C'],
    manifestNames: ['A'],
    hasBranchPolicy: false,
  });
  expect(f.map(x => x.rule).sort()).toEqual([
    'environment-drift',
    'environment-ungated',
  ]);
  expect(
    lintGithubEnvironment({
      environment: 'E',
      secretNames: ['A'],
      manifestNames: ['A'],
      hasBranchPolicy: true,
    }).length
  ).toBe(0);
});

it('lintTokenAges flags missing expiry and old tokens', () => {
  const now = Date.parse('2026-10-25T00:00:00Z');
  const f = lintTokenAges(
    [
      { name: 'old', createdAt: '2025-12-24T00:00:00Z', expiresAt: null },
      {
        name: 'fresh',
        createdAt: '2026-10-20T00:00:00Z',
        expiresAt: '2026-12-01T00:00:00Z',
      },
    ],
    { nowMs: now, maxAgeDays: 90 }
  );
  expect(f.map(x => `${x.rule}:${x.subject}`).sort()).toEqual([
    'token-no-expiry:token:old',
    'token-old:token:old',
  ]);
});
