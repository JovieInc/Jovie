import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import * as libraryActionsMock from '@/.storybook/library-actions-mock';

const ALIASED_ACTION_MODULES = [
  'app/app/(shell)/dashboard/releases/actions.ts',
  'app/app/(shell)/library/actions.ts',
] as const;

function exportedActionNames(relativePath: string): string[] {
  const source = readFileSync(
    path.resolve(__dirname, '../../..', relativePath),
    'utf8'
  );
  return [...source.matchAll(/^export async function (\w+)/gm)].map(
    match => match[1]
  );
}

describe('library-actions-mock', () => {
  it.each(ALIASED_ACTION_MODULES)(
    'exports every action %s exports',
    relativePath => {
      const names = exportedActionNames(relativePath);
      expect(names.length).toBeGreaterThan(0);
      const missing = names.filter(name => !(name in libraryActionsMock));
      expect(missing).toEqual([]);
    }
  );

  it('resolves mutations without touching the server', async () => {
    await expect(libraryActionsMock.connectSpotifyArtist({})).resolves.toEqual({
      success: true,
    });
  });
});
