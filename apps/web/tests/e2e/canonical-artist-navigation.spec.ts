import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { certifyProfileModeHistory } from './utils/profile-mode-history';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('canonical artist navigation', () => {
  // Collect both counterexamples even if the first viewport fails.
  test.describe.configure({ mode: 'default' });
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1440, height: 900 },
  ]) {
    test(`survives Home refresh at ${viewport.width}px`, async ({
      page,
    }, testInfo) => {
      test.setTimeout(120_000);
      await page.setViewportSize(viewport);
      const resultPath = process.env.CANONICAL_PROFILE_RESULT;
      let expectedRevision: string | undefined;
      if (resultPath) {
        const result = JSON.parse(readFileSync(resultPath, 'utf8'));
        expectedRevision = JSON.parse(readFileSync(result.reportPath, 'utf8'))
          .snapshot.releaseSha;
        expect(expectedRevision).toMatch(/^[a-f0-9]{40}$/);
      }
      const revision = async () => {
        const response = await page.request.get('/api/health/build-info');
        expect(response.ok()).toBe(true);
        const { commitSha } = await response.json();
        expect(commitSha).toMatch(/^[a-f0-9]{40}$/);
        if (expectedRevision) expect(commitSha).toBe(expectedRevision);
        return commitSha as string;
      };
      const before = await revision();
      try {
        await certifyProfileModeHistory(page, testInfo, 'tim');
      } finally {
        const after = await revision();
        const path = testInfo.outputPath('navigation-revision.json');
        await writeFile(
          path,
          JSON.stringify({ before, after, expectedRevision })
        );
        await testInfo.attach('navigation-revision.json', {
          path,
          contentType: 'application/json',
        });
        expect(after).toBe(before);
      }
    });
  }
});
