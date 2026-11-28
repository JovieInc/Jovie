import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
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
const fixtureDir = resolve(testDir, '../../fixtures/doppler-keyring');
const archiveKey = {
  name: 'debian-archive-bookworm-automatic.asc',
  sha256: 'c2a9a16fde95e037bafd0fa6b7e31f41b4ff1e85851de5558f19a2a2f0e955e2',
  primary: 'B8B80B5B623EAB6AD8775C45B7C5D7D6350947F8',
  signingSubkey: '4CB50190207B4758A3F73A796ED0E7B82643E131',
};
const securityKey = {
  name: 'debian-archive-bookworm-security-automatic.asc',
  sha256: '74f81645b4e3156d1e9a88c8dd9259271b89c7099d64af89a2a6996b592faa1f',
  primary: '05AB90340C0C5E797F44A8C8254CF3B5AEC0A8F0',
  signingSubkey: 'B0CAB9266E8C3929798B3EEEBDE6D2B9216EC7A8',
};

function publicFixture(key: typeof archiveKey): string {
  const armored = readFileSync(resolve(fixtureDir, key.name), 'utf8');
  expect(createHash('sha256').update(armored).digest('hex')).toBe(key.sha256);
  expect(armored).toContain('-----BEGIN PGP PUBLIC KEY BLOCK-----');
  return armored;
}

function inspectKey(keyPath: string, home: string): string[][] {
  mkdirSync(home, { recursive: true, mode: 0o700 });
  const inspection = spawnSync(
    'gpg',
    ['--batch', '--homedir', home, '--show-keys', '--with-colons', keyPath],
    { encoding: 'utf8' }
  );
  expect(inspection.status, inspection.stderr).toBe(0);
  return inspection.stdout
    .trim()
    .split('\n')
    .map(line => line.split(':'));
}

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
  const verificationHome = resolve(options.runnerTemp, 'verification-gnupg');
  mkdirSync(verificationHome, { recursive: true, mode: 0o700 });
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
        GNUPGHOME: verificationHome,
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

  it('installs a cached, version-pinned CLI without apt and never refreshes the Ubuntu mirrors', () => {
    const action = readFileSync(actionPath, 'utf8');

    expect(action).toMatch(/DOPPLER_CLI_VERSION: '\d+\.\d+\.\d+'/);
    expect(action).toContain(
      'uses: ./.github/actions/vendor/actions-cache/restore'
    );
    expect(action).toContain(
      'uses: ./.github/actions/vendor/actions-cache/save'
    );
    expect(action).toContain('sudo dpkg -i "$DOPPLER_DEB"');
    expect(action).toContain(
      '"Package: doppler Version: ${DOPPLER_CLI_VERSION} "'
    );
    expect(action).toContain(
      '-o Dir::Etc::sourcelist=sources.list.d/doppler-cli.list'
    );
    expect(action).toContain('"doppler=${DOPPLER_CLI_VERSION}"');
    expect(action).not.toContain(
      'sudo apt-get update && sudo apt-get install doppler'
    );
  });

  it('is the only place a workflow installs the Doppler CLI', () => {
    const workflowsDir = resolve(repoRoot, '.github/workflows');
    const inline = readdirSync(workflowsDir)
      .filter(file => /\.ya?ml$/.test(file))
      .filter(file =>
        readFileSync(resolve(workflowsDir, file), 'utf8').includes(
          'packages.doppler.com'
        )
      );
    expect(inline).toEqual([]);
  });

  it('preserves an existing keyring when a successful HTTP response is not a key', () => {
    const root = mkdtempSync(resolve(tmpdir(), 'doppler-invalid-'));
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
    const root = mkdtempSync(resolve(tmpdir(), 'doppler-valid-'));
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

      writeFileSync(armoredSource, publicFixture(archiveKey));
      const result = runInstaller({
        source: armoredSource,
        fingerprint: archiveKey.primary,
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

      const installed = inspectKey(target, gpgHome);
      expect(installed.filter(row => row[0] === 'pub')).toHaveLength(1);
      const subkeys = installed.filter(row => row[0] === 'sub');
      expect(subkeys).toHaveLength(1);
      expect(subkeys[0]![11]).toContain('s');
      expect(
        installed.filter(row => row[0] === 'fpr').map(row => row[9])
      ).toEqual([archiveKey.primary, archiveKey.signingSubkey]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects multiple primary keys and preserves the existing keyring', () => {
    const root = mkdtempSync(resolve(tmpdir(), 'doppler-multi-'));
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

      writeFileSync(
        armoredSource,
        publicFixture(archiveKey) + publicFixture(securityKey)
      );
      const bundle = inspectKey(armoredSource, gpgHome);
      expect(bundle.filter(row => row[0] === 'pub')).toHaveLength(2);
      expect(bundle.filter(row => row[0] === 'sub')).toHaveLength(2);
      expect(bundle.filter(row => row[0] === 'fpr').map(row => row[9])).toEqual(
        [
          archiveKey.primary,
          archiveKey.signingSubkey,
          securityKey.primary,
          securityKey.signingSubkey,
        ]
      );
      const result = runInstaller({
        source: armoredSource,
        fingerprint: archiveKey.primary,
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

  it('rejects a signing subkey fingerprint and preserves the existing keyring', () => {
    const root = mkdtempSync(resolve(tmpdir(), 'doppler-subkey-'));
    try {
      const binDir = resolve(root, 'bin');
      const keyringDir = resolve(root, 'keyrings');
      const source = resolve(root, 'fixture.asc');
      const target = resolve(keyringDir, 'doppler.gpg');
      mkdirSync(binDir);
      mkdirSync(keyringDir);
      writeCurlStub(binDir);
      writeFileSync(source, publicFixture(archiveKey));
      writeFileSync(target, 'previous-valid-keyring');
      const result = runInstaller({
        source,
        fingerprint: archiveKey.signingSubkey,
        target,
        runnerTemp: root,
        binDir,
      });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('fingerprint validation failed');
      expect(result.stderr).toContain('gpg --batch --show-keys');
      expect(result.stderr).not.toContain('gpg --batch --yes --dearmor');
      expect(result.stderr).not.toContain('mv -f --');
      expect(readFileSync(target, 'utf8')).toBe('previous-valid-keyring');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
