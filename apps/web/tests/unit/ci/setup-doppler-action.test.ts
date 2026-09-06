import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, '..', '..', '..', '..', '..');
const actionPath = resolve(
  repoRoot,
  '.github/actions/setup-doppler/action.yml'
);
const installerPath = resolve(
  repoRoot,
  '.github/scripts/install-doppler-keyring.sh'
);
const dopplerFingerprint = 'BD8F51EC1320748CED4E6E3BDE2A7741A397C129';

function writeCurlStub(binDir: string): void {
  const stubPath = resolve(binDir, 'curl');
  writeFileSync(
    stubPath,
    `#!/usr/bin/env bash
set -euo pipefail
output=''
while [ "$#" -gt 0 ]; do
  if [ "$1" = '--output' ]; then
    output="$2"
    shift 2
    continue
  fi
  shift
done
test -n "$output"
cp "$FAKE_CURL_SOURCE" "$output"
`
  );
  chmodSync(stubPath, 0o755);
}

function runInstaller(options: {
  source: string;
  fingerprint: string;
  target: string;
  runnerTemp: string;
  binDir: string;
}) {
  return spawnSync(
    'bash',
    [
      '-x',
      installerPath,
      'https://packages.example.test/doppler.key',
      options.fingerprint,
      options.target,
    ],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        FAKE_CURL_SOURCE: options.source,
        PATH: `${options.binDir}:${process.env.PATH ?? ''}`,
        PS4: '+${LINENO}: ',
        RUNNER_TEMP: options.runnerTemp,
      },
    }
  );
}

describe('Doppler keyring installer', () => {
  it('pins the trusted primary fingerprint and avoids streaming into the live keyring', () => {
    const action = readFileSync(actionPath, 'utf8');
    const installer = readFileSync(installerPath, 'utf8');

    expect(action).toContain(dopplerFingerprint);
    expect(action).toContain('bash .github/scripts/install-doppler-keyring.sh');
    expect(installer).toContain('--retry-all-errors');
    expect(installer).toContain('--output "$armored_key"');
    expect(installer).toContain(
      'mv -f -- "$destination_candidate" "$keyring_path"'
    );
    expect(installer).not.toMatch(/curl[^\n]*\|[^\n]*gpg/);
  });

  it('preserves an existing keyring when a successful HTTP response is not a key', () => {
    const root = mkdtempSync('/tmp/doppler-invalid-');
    try {
      const binDir = resolve(root, 'bin');
      const keyringDir = resolve(root, 'keyrings');
      const target = resolve(keyringDir, 'doppler.gpg');
      const invalidSource = resolve(root, 'response.html');
      mkdirSync(binDir);
      mkdirSync(keyringDir);
      writeCurlStub(binDir);
      writeFileSync(invalidSource, '<html>temporary upstream error</html>');
      writeFileSync(target, 'previous-valid-keyring');

      const result = runInstaller({
        source: invalidSource,
        fingerprint: dopplerFingerprint,
        target,
        runnerTemp: root,
        binDir,
      });

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('not a valid OpenPGP keyring');
      expect(result.stderr).toContain('gpg --batch --show-keys');
      expect(result.stderr).not.toContain('gpg --batch --yes --dearmor');
      expect(result.stderr).not.toContain('mv -f --');
      expect(readFileSync(target, 'utf8')).toBe('previous-valid-keyring');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('atomically installs a complete key with the configured fingerprint', () => {
    const root = mkdtempSync('/tmp/doppler-valid-');
    try {
      const binDir = resolve(root, 'bin');
      const keyringDir = resolve(root, 'keyrings');
      const gpgHome = resolve(root, 'gnupg');
      const armoredSource = resolve(root, 'fixture.asc');
      const target = resolve(keyringDir, 'doppler.gpg');
      mkdirSync(binDir);
      mkdirSync(keyringDir);
      mkdirSync(gpgHome, { mode: 0o700 });
      writeCurlStub(binDir);
      writeFileSync(target, 'previous-valid-keyring');

      const generated = spawnSync(
        'gpg',
        [
          '--batch',
          '--homedir',
          gpgHome,
          '--passphrase',
          '',
          '--quick-generate-key',
          'Doppler Installer Fixture <fixture@jov.ie>',
          'ed25519',
          'sign',
          '1d',
        ],
        { encoding: 'utf8' }
      );
      expect(generated.status, generated.stderr).toBe(0);

      const exported = spawnSync(
        'gpg',
        ['--batch', '--homedir', gpgHome, '--armor', '--export'],
        { encoding: 'utf8' }
      );
      expect(exported.status, exported.stderr).toBe(0);
      writeFileSync(armoredSource, exported.stdout);

      const fingerprintResult = spawnSync(
        'gpg',
        ['--batch', '--homedir', gpgHome, '--with-colons', '--fingerprint'],
        { encoding: 'utf8' }
      );
      expect(fingerprintResult.status, fingerprintResult.stderr).toBe(0);
      const fingerprint = fingerprintResult.stdout
        .split('\n')
        .find(line => line.startsWith('fpr:'))
        ?.split(':')[9];
      expect(fingerprint).toMatch(/^[0-9A-F]{40}$/);

      const addedSubkey = spawnSync(
        'gpg',
        [
          '--batch',
          '--homedir',
          gpgHome,
          '--passphrase',
          '',
          '--quick-add-key',
          fingerprint!,
          'ed25519',
          'sign',
          '1d',
        ],
        { encoding: 'utf8' }
      );
      expect(addedSubkey.status, addedSubkey.stderr).toBe(0);

      const exportWithSubkey = spawnSync(
        'gpg',
        ['--batch', '--homedir', gpgHome, '--armor', '--export'],
        { encoding: 'utf8' }
      );
      expect(exportWithSubkey.status, exportWithSubkey.stderr).toBe(0);
      writeFileSync(armoredSource, exportWithSubkey.stdout);

      const result = runInstaller({
        source: armoredSource,
        fingerprint: fingerprint!,
        target,
        runnerTemp: root,
        binDir,
      });
      expect(result.status, result.stderr).toBe(0);
      expect(
        result.stderr.match(/verify_single_primary/g)?.length
      ).toBeGreaterThanOrEqual(2);
      expect(result.stderr).toContain('gpg --batch --yes --dearmor');
      expect(result.stderr).toContain('install -m 0644');
      expect(result.stderr).toContain('mv -f --');

      const installedFingerprint = spawnSync(
        'gpg',
        ['--batch', '--show-keys', '--with-colons', target],
        { encoding: 'utf8' }
      )
        .stdout.split('\n')
        .find(line => line.startsWith('fpr:'))
        ?.split(':')[9];
      expect(installedFingerprint).toBe(fingerprint);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects multiple primary keys and preserves the existing keyring', () => {
    const root = mkdtempSync('/tmp/doppler-multi-');
    try {
      const binDir = resolve(root, 'bin');
      const keyringDir = resolve(root, 'keyrings');
      const gpgHome = resolve(root, 'gnupg');
      const armoredSource = resolve(root, 'bundle.asc');
      const target = resolve(keyringDir, 'doppler.gpg');
      mkdirSync(binDir);
      mkdirSync(keyringDir);
      mkdirSync(gpgHome, { mode: 0o700 });
      writeCurlStub(binDir);
      writeFileSync(target, 'previous-valid-keyring');

      for (const identity of [
        'Expected Fixture <expected@jov.ie>',
        'Unrelated Fixture <unrelated@jov.ie>',
      ]) {
        const generated = spawnSync(
          'gpg',
          [
            '--batch',
            '--homedir',
            gpgHome,
            '--passphrase',
            '',
            '--quick-generate-key',
            identity,
            'ed25519',
            'sign',
            '1d',
          ],
          { encoding: 'utf8' }
        );
        expect(generated.status, generated.stderr).toBe(0);
      }

      const fingerprints = spawnSync(
        'gpg',
        ['--batch', '--homedir', gpgHome, '--with-colons', '--fingerprint'],
        { encoding: 'utf8' }
      )
        .stdout.split('\n')
        .filter(line => line.startsWith('fpr:'))
        .map(line => line.split(':')[9]!);
      expect(fingerprints).toHaveLength(2);

      const exported = spawnSync(
        'gpg',
        ['--batch', '--homedir', gpgHome, '--armor', '--export'],
        { encoding: 'utf8' }
      );
      expect(exported.status, exported.stderr).toBe(0);
      writeFileSync(armoredSource, exported.stdout);

      const result = runInstaller({
        source: armoredSource,
        fingerprint: fingerprints[0]!,
        target,
        runnerTemp: root,
        binDir,
      });

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(
        'must contain exactly one well-formed primary key'
      );
      expect(result.stderr).toContain('gpg --batch --show-keys');
      expect(result.stderr).not.toContain('gpg --batch --yes --dearmor');
      expect(result.stderr).not.toContain('mv -f --');
      expect(readFileSync(target, 'utf8')).toBe('previous-valid-keyring');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
