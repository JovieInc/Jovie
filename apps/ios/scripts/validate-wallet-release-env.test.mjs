import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const scriptPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'validate-wallet-release-env.sh'
);

// macOS runners ship LibreSSL as `openssl`; fixtures and the script under test
// need real OpenSSL. Mirror the resolution order in validate-wallet-release-env.sh.
function resolveOpenssl() {
  const candidates = [
    process.env.APPLE_WALLET_OPENSSL,
    'openssl',
    '/opt/homebrew/opt/openssl@3/bin/openssl',
    '/usr/local/opt/openssl@3/bin/openssl',
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      const version = execFileSync(candidate, ['version'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      if (/^OpenSSL /.test(version.trim())) return candidate;
    } catch {}
  }
  throw new Error(
    'OpenSSL (not LibreSSL) is required for Wallet release env tests.'
  );
}

const opensslBin = resolveOpenssl();

function openssl(args, env) {
  execFileSync(opensslBin, args, { env, stdio: 'ignore' });
}

function makeSigningFixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'wallet-release-env-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const env = { PATH: process.env.PATH };
  const wwdrKey = path.join(root, 'wwdr-key.pem');
  const wwdrCert = path.join(root, 'wwdr.pem');
  const signerKey = path.join(root, 'signer-key.pem');
  const signerCsr = path.join(root, 'signer.csr');
  const signerCert = path.join(root, 'signer.pem');
  const extensions = path.join(root, 'extensions.cnf');
  writeFileSync(
    extensions,
    'basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\nextendedKeyUsage=clientAuth\n'
  );
  openssl(
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      wwdrKey,
      '-out',
      wwdrCert,
      '-days',
      '30',
      '-subj',
      '/CN=Apple Worldwide Developer Relations Certification Authority/O=Apple Inc./C=US',
      '-addext',
      'basicConstraints=critical,CA:TRUE',
      '-addext',
      'keyUsage=critical,keyCertSign,cRLSign',
    ],
    env
  );
  openssl(
    [
      'req',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      signerKey,
      '-out',
      signerCsr,
      '-subj',
      '/UID=pass.ie.jov.profile/CN=Pass Type ID: pass.ie.jov.profile/OU=TEAM123456/O=Jovie/C=US',
    ],
    env
  );
  openssl(
    [
      'x509',
      '-req',
      '-in',
      signerCsr,
      '-CA',
      wwdrCert,
      '-CAkey',
      wwdrKey,
      '-CAcreateserial',
      '-out',
      signerCert,
      '-days',
      '30',
      '-sha256',
      '-extfile',
      extensions,
    ],
    env
  );
  return {
    PATH: process.env.PATH,
    APPLE_WALLET_OPENSSL: opensslBin,
    APPLE_WALLET_PASS_TYPE_IDENTIFIER: 'pass.ie.jov.profile',
    APPLE_WALLET_TEAM_IDENTIFIER: 'TEAM123456',
    APPLE_WALLET_SIGNER_CERT_PEM: readFileSync(signerCert, 'utf8'),
    APPLE_WALLET_SIGNER_KEY_PEM: readFileSync(signerKey, 'utf8'),
    APPLE_WALLET_WWDR_CERT_PEM: readFileSync(wwdrCert, 'utf8'),
    APPLE_WALLET_AUTH_TOKEN_SECRET: 'a'.repeat(32),
    APPLE_WALLET_APNS_PRODUCTION: 'true',
  };
}

function runValidator(env) {
  try {
    return {
      failed: false,
      output: execFileSync('bash', [scriptPath], { env, encoding: 'utf8' }),
    };
  } catch (error) {
    return {
      failed: true,
      output: `${error.stdout ?? ''}${error.stderr ?? ''}`,
    };
  }
}

test('validates a matching production Wallet signing chain without disclosing values', t => {
  const env = makeSigningFixture(t);
  const result = runValidator(env);
  assert.equal(result.failed, false);
  assert.match(
    result.output,
    /Validated redacted production Wallet signing configuration/
  );
  assert.doesNotMatch(result.output, /BEGIN|a{32}|pass\.ie\.jov\.profile/);
});

test('normalizes literal newline PEM values', t => {
  const env = makeSigningFixture(t);
  for (const key of [
    'APPLE_WALLET_SIGNER_CERT_PEM',
    'APPLE_WALLET_SIGNER_KEY_PEM',
    'APPLE_WALLET_WWDR_CERT_PEM',
  ]) {
    env[key] = env[key].replaceAll('\n', String.raw`\n`);
  }
  assert.equal(runValidator(env).failed, false);
});

for (const [name, mutate, message] of [
  [
    'rejects a Pass Type ID that differs from the certificate',
    env => (env.APPLE_WALLET_PASS_TYPE_IDENTIFIER = 'pass.ie.jov.other'),
    /Pass Type ID does not match/,
  ],
  [
    'rejects a Team ID that differs from the certificate',
    env => (env.APPLE_WALLET_TEAM_IDENTIFIER = 'OTHER12345'),
    /Team ID does not match/,
  ],
  [
    'rejects a short server authentication secret',
    env => (env.APPLE_WALLET_AUTH_TOKEN_SECRET = 'too-short'),
    /at least 32 characters/,
  ],
  [
    'rejects the APNs sandbox for production readiness',
    env => (env.APPLE_WALLET_APNS_PRODUCTION = 'false'),
    /APNS_PRODUCTION=true/,
  ],
]) {
  test(name, t => {
    const env = makeSigningFixture(t);
    mutate(env);
    const result = runValidator(env);
    assert.equal(result.failed, true);
    assert.match(result.output, message);
  });
}

test('rejects a private key that does not pair with the certificate', t => {
  const env = makeSigningFixture(t);
  const root = mkdtempSync(path.join(tmpdir(), 'wallet-other-key-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const otherKey = path.join(root, 'other-key.pem');
  openssl(['genpkey', '-algorithm', 'RSA', '-out', otherKey], env);
  env.APPLE_WALLET_SIGNER_KEY_PEM = readFileSync(otherKey, 'utf8');
  const result = runValidator(env);
  assert.equal(result.failed, true);
  assert.match(result.output, /certificate and private key do not match/);
});

test('rejects a signer that does not chain to the supplied WWDR certificate', t => {
  const env = makeSigningFixture(t);
  const unrelated = makeSigningFixture(t);
  env.APPLE_WALLET_WWDR_CERT_PEM = unrelated.APPLE_WALLET_WWDR_CERT_PEM;
  const result = runValidator(env);
  assert.equal(result.failed, true);
  assert.match(result.output, /does not verify against the supplied WWDR/);
});
