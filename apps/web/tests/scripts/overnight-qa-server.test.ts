import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import { pipeServerLogs } from '../../scripts/overnight-qa/server';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs
      .splice(0)
      .map(directory => rm(directory, { recursive: true, force: true }))
  );
});

describe('overnight-qa server log piping', () => {
  it('streams child stdout and stderr into append-mode log files', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'overnight-qa-server-'));
    tempDirs.push(tempDir);

    const server = new EventEmitter() as EventEmitter & {
      stdout: PassThrough;
      stderr: PassThrough;
    };
    server.stdout = new PassThrough();
    server.stderr = new PassThrough();

    pipeServerLogs(
      server as never,
      join(tempDir, 'dev-server.stdout.log'),
      join(tempDir, 'dev-server.stderr.log')
    );

    server.stdout.write('ready\n');
    server.stderr.write('warn\n');
    server.stdout.end();
    server.stderr.end();
    server.emit('close');

    await new Promise(resolve => setTimeout(resolve, 25));

    await expect(
      readFile(join(tempDir, 'dev-server.stdout.log'), 'utf8')
    ).resolves.toBe('ready\n');
    await expect(
      readFile(join(tempDir, 'dev-server.stderr.log'), 'utf8')
    ).resolves.toBe('warn\n');
  });
});
