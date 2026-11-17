// Regression for run 42650227305 (2026-11-09): the certify step resolves
// each screen's trusted producer artifact through `gh api`, and ONE transient
// nonzero exit (secondary rate limit / blip) killed that screen's exact-head
// proof with 'controlled transport unavailable' — the gate then reported
// 'missing exact-head proof' for four screens whose artifacts sat intact in
// the same run. Transport failures are now retried with bounded delays; trust
// findings are untouched and still fail closed on the first finding.
import { describe, expect, it, vi } from 'vitest';

const spawnSync = vi.hoisted(() => vi.fn());
vi.mock('node:child_process', () => ({ spawnSync }));

const { run, setTransportRetryDelaysForTests } = await import(
  '../../invariants/screen-proof-resolver.mjs'
);

describe('controlled transport retry (run 42650227305)', () => {
  it.each([
    [
      'gh',
      ['api', 'repos/x/y'],
      { status: 1, stderr: 'HTTP 401: Bad credentials' },
    ],
    [
      'gh',
      ['api', 'repos/x/y'],
      { status: 1, stderr: 'HTTP 403: Resource not accessible by integration' },
    ],
    ['gh', ['api', 'repos/x/y'], { status: 1, stderr: 'HTTP 404: Not Found' }],
    ['gh', ['api', 'repos/x/y'], { status: null, error: { code: 'ENOENT' } }],
    ['gh', ['api', 'repos/x/y'], { status: null, signal: 'SIGTERM' }],
    ['unzip', ['-p', 'artifact.zip'], { status: 1, stderr: '' }],
  ])(
    'does not retry permanent, cancelled or local-tool failures (%s %j)',
    (command, args, result) => {
      setTransportRetryDelaysForTests([0, 0, 0]);
      spawnSync.mockReset();
      spawnSync.mockReturnValue(result);
      expect(() => run(command, args)).toThrow(
        'controlled transport unavailable'
      );
      expect(spawnSync).toHaveBeenCalledTimes(1);
    }
  );

  it('still attempts the read once with an empty retry schedule', () => {
    setTransportRetryDelaysForTests([]);
    spawnSync.mockReset();
    spawnSync.mockReturnValue({ status: 0, stdout: 'ok' });
    expect(run('gh', ['api', 'repos/x/y'])).toBe('ok');
    expect(spawnSync).toHaveBeenCalledTimes(1);
  });

  it('recovers a screen proof when gh api fails transiently, then succeeds', () => {
    spawnSync.mockReset();
    setTransportRetryDelaysForTests([0, 0, 0]);
    spawnSync
      .mockImplementationOnce(() => ({ status: 1, stdout: '', stderr: '' }))
      .mockImplementationOnce(() => ({ status: null, stdout: '', stderr: '' }))
      .mockImplementationOnce(() => ({ status: 0, stdout: 'ok', stderr: '' }));
    expect(run('gh', ['api', 'repos/x/y/actions/artifacts/42'])).toBe('ok');
    expect(spawnSync).toHaveBeenCalledTimes(3);
  });

  it('still fails closed after bounded retries when gh api keeps failing', () => {
    setTransportRetryDelaysForTests([0, 0, 0]);
    spawnSync.mockReset();
    spawnSync.mockImplementation(() => ({
      status: 1,
      stdout: '',
      stderr: 'gh: API rate limit exceeded',
    }));
    expect(() => run('gh', ['api', 'repos/x/y'])).toThrow(
      'controlled transport unavailable'
    );
    expect(spawnSync).toHaveBeenCalledTimes(3);
  });

  it('attempts transport once when retries are disabled', () => {
    setTransportRetryDelaysForTests([0]);
    spawnSync.mockReset();
    spawnSync.mockImplementation(() => ({ status: 1, stdout: '', stderr: '' }));
    expect(() => run('gh', ['api', 'repos/x/y'])).toThrow(
      'controlled transport unavailable'
    );
    expect(spawnSync).toHaveBeenCalledTimes(1);
  });
});
