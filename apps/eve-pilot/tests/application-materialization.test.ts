import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { materializeApp } from '../scripts/materialize-app.mjs';

describe('independent application source export', () => {
  it.each([
    'jovie',
    'summer',
  ])('exports only allowlisted %s source with checksums and no shared workspace install', identity => {
    const directory = mkdtempSync(join(tmpdir(), 'eve-app-export-'));
    const destination = join(directory, identity);
    try {
      const receipt = materializeApp(identity, destination);
      expect(receipt.status).toBe('prepared-not-commissioned');
      expect(receipt.sourceCommit).toMatch(/^[a-f0-9]{40}$/u);
      expect(existsSync(join(destination, 'pnpm-lock.yaml'))).toBe(true);
      expect(existsSync(join(destination, '.env'))).toBe(false);
      const other = identity === 'summer' ? 'jovie' : 'summer';
      expect(existsSync(join(destination, `identities/${other}`))).toBe(false);
      for (const [path, hash] of Object.entries(receipt.files)) {
        expect(
          createHash('sha256')
            .update(readFileSync(join(destination, path)))
            .digest('hex')
        ).toBe(hash);
        if (path.startsWith('agent/'))
          expect(readFileSync(join(destination, path), 'utf8')).not.toMatch(
            /(?:apps\/web|@\/lib\/db)/u
          );
      }
      if (identity === 'summer') {
        expect(
          readFileSync(join(destination, 'agent/channels/eve.ts'), 'utf8')
        ).toContain('disableRoute()');
        expect(
          existsSync(
            join(destination, 'agent/tools/jovie_capability_manifest.ts')
          )
        ).toBe(false);
        expect(
          readFileSync(
            join(destination, 'agent/lib/vercel-blob-shadow-store.ts'),
            'utf8'
          ).match(/token: summerStoreToken\(\)/gu)
        ).toHaveLength(5);
      } else
        expect(existsSync(join(destination, 'agent/schedules'))).toBe(false);
      expect(() => materializeApp(identity, destination)).toThrow(
        'destination must not exist'
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it('rejects unknown identities before writing', () => {
    expect(() => materializeApp('ovie', '/unused')).toThrow(
      'unknown application'
    );
  });
});
