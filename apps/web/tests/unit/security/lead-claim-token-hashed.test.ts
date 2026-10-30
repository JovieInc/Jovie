import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guard: leads.claim_token (plaintext) is deprecated and nulled by migration
 * 0151. Nothing may read or write it; use claimTokenHash with
 * lib/leads/lead-claim-token.ts. A plaintext token at rest makes every database
 * read, backup and admin API response a working claim link.
 */
const WEB_ROOT = join(__dirname, '../../..');

describe('leads.claimToken (plaintext) is unused', () => {
  it('no production code references the plaintext column', () => {
    let hits = '';
    try {
      hits = execFileSync(
        'git',
        [
          'grep',
          '-nE',
          'leads\\.claimToken\\b',
          '--',
          'app',
          'lib',
          ':!*.test.ts',
          ':!*.test.tsx',
        ],
        { cwd: WEB_ROOT, encoding: 'utf8' }
      );
    } catch (error) {
      // git grep exits 1 when nothing matches, which is the passing case.
      if ((error as { status?: number }).status !== 1) throw error;
    }
    expect(hits.trim()).toBe('');
  });
});
