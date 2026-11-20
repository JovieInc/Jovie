import { describe, expect, it } from 'vitest';
import { type CliOutput, fatalExitCode } from './cli.js';
import { closedPipeListener, isClosedPipeError } from './closed-pipe.js';

function capture() {
  let value = '';
  const output: CliOutput = {
    write(chunk: string) {
      value += chunk;
      return true;
    },
  };
  return { output, read: () => value };
}

describe('closed-pipe guard (JOV-13096)', () => {
  it('exits with the pending code on a closed pipe and rethrows anything else', () => {
    const exits: number[] = [];
    const listener = closedPipeListener(code => exits.push(code));
    for (const code of [
      'EPIPE',
      'EOF',
      'ERR_STREAM_DESTROYED',
      'ERR_STREAM_WRITE_AFTER_END',
    ]) {
      listener(Object.assign(new Error(`write ${code}`), { code }));
    }
    expect(exits).toEqual([0, 0, 0, 0]);
    expect(() =>
      listener(Object.assign(new Error('disk'), { code: 'EIO' }))
    ).toThrow('disk');
  });

  it('classifies only the closed-pipe family as quiet exit', () => {
    for (const code of [
      'EPIPE',
      'EOF',
      'ERR_STREAM_DESTROYED',
      'ERR_STREAM_WRITE_AFTER_END',
    ]) {
      expect(
        isClosedPipeError(Object.assign(new Error(`write ${code}`), { code }))
      ).toBe(true);
    }
    for (const code of [undefined, 'EIO', 'ENOSPC', 'EACCES']) {
      expect(
        isClosedPipeError(Object.assign(new Error('real error'), { code }))
      ).toBe(false);
    }
    expect(isClosedPipeError(undefined)).toBe(false);
  });
});

describe('fatal pipe fallback (JOV-13096)', () => {
  it('exits with the pending code and never reports a hung-up consumer', () => {
    const stderr = capture();
    process.exitCode = 0;
    expect(
      fatalExitCode(
        ['docs'],
        Object.assign(new Error('write EPIPE'), { code: 'EPIPE' })
      )
    ).toBe(0);
    process.exitCode = 3;
    expect(
      fatalExitCode(
        ['docs'],
        Object.assign(new Error('write after end'), {
          code: 'ERR_STREAM_WRITE_AFTER_END',
        })
      )
    ).toBe(3);
    process.exitCode = undefined;
    expect(
      fatalExitCode(['docs'], Object.assign(new Error('eof'), { code: 'EOF' }))
    ).toBe(0);
    expect(stderr.read()).toBe('');
  });

  it('reports anything else in one line and exits 1', () => {
    const stderr = capture();
    const stdout = capture();
    const code = fatalExitCode(
      ['docs'],
      new Error('disk gone'),
      stdout.output,
      stderr.output
    );
    expect(code).toBe(1);
    expect(stderr.read()).toContain('Unexpected error: disk gone');
    expect(stderr.read()).not.toContain('EPIPE');
  });
});
