import { writeSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openServerLogDescriptors } from '../../scripts/overnight-qa/server';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs
      .splice(0)
      .map(directory => rm(directory, { recursive: true, force: true }))
  );
});

describe('overnight-qa server log descriptors', () => {
  it('opens append-mode file descriptors for direct child stdio', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'overnight-qa-server-'));
    tempDirs.push(tempDir);

    const logs = openServerLogDescriptors(
      join(tempDir, 'dev-server.stdout.log'),
      join(tempDir, 'dev-server.stderr.log')
    );

    writeSync(logs.stdoutFd, 'ready\n');
    writeSync(logs.stderrFd, 'warn\n');
    logs.close();
    logs.close();

    await expect(
      readFile(join(tempDir, 'dev-server.stdout.log'), 'utf8')
    ).resolves.toBe('ready\n');
    await expect(
      readFile(join(tempDir, 'dev-server.stderr.log'), 'utf8')
    ).resolves.toBe('warn\n');
  });
});
