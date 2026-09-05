import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  environmentVariableNames,
  renderEnvironmentVariableNameDiagnostics,
  runEnvironmentVariableNameDiagnostics,
} from '../environment-file-names.mjs';

const SENTINEL = 'private-material-must-never-appear';
const CLI = resolve(import.meta.dirname, '../environment-file-names.mjs');
const temporaryDirectories = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

function writeEnvironmentFile(contents) {
  const directory = mkdtempSync(resolve(tmpdir(), 'jovie-env-names-'));
  temporaryDirectories.push(directory);
  const path = resolve(directory, 'runtime.env');
  writeFileSync(path, contents, { mode: 0o600 });
  return path;
}

describe('environmentVariableNames', () => {
  it('returns names only for single-line and quoted multiline assignments', () => {
    const contents = [
      '# signer environment',
      'PUBLIC_KEYS_JSON="{\\"key\\":\\"-----BEGIN PUBLIC KEY-----',
      SENTINEL,
      '-----END PUBLIC KEY-----\\"}"',
      'SIGNING_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----',
      SENTINEL,
      '-----END PRIVATE KEY-----"',
      'SIGNING_KEY_ID=outcome-rotation-r2',
    ].join('\n');

    const names = environmentVariableNames(contents);

    expect(names).toEqual([
      'PUBLIC_KEYS_JSON',
      'SIGNING_PRIVATE_KEY',
      'SIGNING_KEY_ID',
    ]);
    expect(JSON.stringify(names)).not.toContain(SENTINEL);
    expect(JSON.stringify(names)).not.toContain('PRIVATE KEY');
  });

  it.each([
    ['malformed', `SAFE=1\n${SENTINEL}`],
    ['unterminated', `PRIVATE="${SENTINEL}`],
  ])('rejects %s input without reflecting values', (_name, contents) => {
    let error;
    try {
      environmentVariableNames(contents);
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(Error);
    expect(String(error)).not.toContain(SENTINEL);
  });

  it('rejects non-text input with a constant error', () => {
    expect(() => environmentVariableNames(null)).toThrow(
      'environment file must be text'
    );
  });

  it('handles CRLF, comments, whitespace, and escaped double quotes', () => {
    const contents = [
      '; managed by systemd',
      '  FIRST="one \\"quoted\\" value"',
      '',
      'SECOND=two',
    ].join('\r\n');

    expect(environmentVariableNames(contents)).toEqual(['FIRST', 'SECOND']);
  });

  it('renders only safe diagnostic rows', () => {
    expect(
      renderEnvironmentVariableNameDiagnostics('FIRST=one\nSECOND=two\n')
    ).toBe(
      'environment_variable_name=FIRST\nenvironment_variable_name=SECOND\n'
    );
  });

  it('runs the injected name-only diagnostic boundary', async () => {
    const output = [];
    const errors = [];

    const status = await runEnvironmentVariableNameDiagnostics(['ignored'], {
      read: async () => 'FIRST=one\nSECOND=two\n',
      writeOut: value => output.push(value),
      writeError: value => errors.push(value),
    });

    expect(status).toBe(0);
    expect(output).toEqual([
      'environment_variable_name=FIRST\nenvironment_variable_name=SECOND\n',
    ]);
    expect(errors).toEqual([]);
  });

  it('fails closed for invalid arguments and unreadable files', async () => {
    const errors = [];
    const writeError = value => errors.push(value);

    expect(
      await runEnvironmentVariableNameDiagnostics([], { writeError })
    ).toBe(64);
    expect(
      await runEnvironmentVariableNameDiagnostics(['ignored'], {
        read: async () => {
          throw new Error(SENTINEL);
        },
        writeError,
      })
    ).toBe(1);
    expect(errors).toEqual([
      'usage: symphony-environment-file-names <environment-file>\n',
      'environment_file_diagnostic=unavailable\n',
    ]);
    expect(JSON.stringify(errors)).not.toContain(SENTINEL);
  });

  it('keeps multiline secret content out of the executable diagnostic boundary', () => {
    const sentinel = 'PRIVATE_CONTINUATION_MUST_NEVER_PRINT';
    const path = writeEnvironmentFile(
      `SAFE=value\nPRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n${sentinel}\n-----END PRIVATE KEY-----"\nAFTER=ok\n`
    );

    const result = spawnSync(process.execPath, [CLI, path], {
      encoding: 'utf8',
      env: {},
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toBe(
      'environment_variable_name=SAFE\n' +
        'environment_variable_name=PRIVATE_KEY\n' +
        'environment_variable_name=AFTER\n'
    );
    expect(`${result.stdout}${result.stderr}`).not.toContain(sentinel);
    expect(`${result.stdout}${result.stderr}`).not.toContain('PRIVATE KEY');
  });

  it('emits a constant failure without reflecting malformed multiline input', () => {
    const sentinel = 'UNTERMINATED_SECRET_MUST_NEVER_PRINT';
    const path = writeEnvironmentFile(
      `PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n${sentinel}\n`
    );

    const result = spawnSync(process.execPath, [CLI, path], {
      encoding: 'utf8',
      env: {},
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('environment_file_diagnostic=unavailable\n');
    expect(`${result.stdout}${result.stderr}`).not.toContain(sentinel);
  });
});
