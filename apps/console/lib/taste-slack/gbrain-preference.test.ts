import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { writeTastePreference } from './gbrain-preference';

describe('writeTastePreference', () => {
  let tempDir = '';

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'taste-pref-'));
  });

  it('appends a durable local preference log for gbrain sync', async () => {
    const result = await writeTastePreference(
      {
        issueId: 'issue-1',
        identifier: 'JOV-100',
        title: 'Pick hero color',
        label: 'needs:taste',
        decision: 'approved',
        reviewerSlackUserId: 'U0B8QSEL6PL',
        linearUrl: 'https://linear.app/jovie/issue/JOV-100',
      },
      tempDir
    );

    const content = await readFile(result.localLogPath, 'utf8');
    expect(content).toContain('decision: approved');
    expect(content).toContain('JOV-100');
    expect(content).toContain('needs:taste');
    expect(content).toContain('U0B8QSEL6PL');
  });
});
