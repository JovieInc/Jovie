import { describe, expect, it } from 'vitest';
import { environmentVariableNames } from '../environment-file-names.mjs';

const SENTINEL = 'private-material-must-never-appear';

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

  it('handles CRLF, comments, whitespace, and escaped double quotes', () => {
    const contents = [
      '; managed by systemd',
      '  FIRST="one \\"quoted\\" value"',
      '',
      'SECOND=two',
    ].join('\r\n');

    expect(environmentVariableNames(contents)).toEqual(['FIRST', 'SECOND']);
  });
});
