import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SETTINGS_ROOT = join(process.cwd(), 'app', 'app', '(shell)', 'settings');

function collectPageFiles(dir: string, results: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      collectPageFiles(fullPath, results);
      continue;
    }

    if (fullPath.endsWith('page.tsx') || fullPath.endsWith('Content.tsx')) {
      results.push(fullPath);
    }
  }

  return results;
}

describe('settings route error guard', () => {
  it('keeps production settings route entrypoints on the canonical PageErrorState surface', () => {
    const files = collectPageFiles(SETTINGS_ROOT);

    const offenders = files.filter(filePath =>
      readFileSync(filePath, 'utf8').includes('SettingsErrorState')
    );

    expect(offenders).toEqual([]);
  });
});
