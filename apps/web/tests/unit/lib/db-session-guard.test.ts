import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('db session usage in lib helpers', () => {
  it('wraps user-scoped helpers with db session setup', () => {
    const root = process.cwd();
    const expectations: Array<{ file: string; required: string[] }> = [
      {
        file: 'lib/username/availability.ts',
        required: ['withDbSession'],
      },
      {
        file: 'lib/username/sync.ts',
        required: ['withDbSessionTx'],
      },
      {
        file: 'lib/notifications/preferences.ts',
        required: ['withDbSession'],
      },
      {
        file: 'lib/services/link-wrapping.ts',
        required: ['withDbSession'],
      },
    ];

    for (const { file, required } of expectations) {
      const contents = readFileSync(path.join(root, file), 'utf8');
      for (const token of required) {
        expect(contents).toContain(token);
      }
    }
  });
});
