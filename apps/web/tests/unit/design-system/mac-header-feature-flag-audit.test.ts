import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const appRoot = resolve(__dirname, '../../..');

describe('JOV-5463 FeatureFlagAuditSection Mac header clamp', () => {
  it('keeps the Recent Changes shell h2 at two lines max', () => {
    const source = readFileSync(
      resolve(
        appRoot,
        'app/app/(shell)/admin/features/FeatureFlagAuditSection.tsx'
      ),
      'utf8'
    );
    const heading = source.match(/<h2 className='([^']+)'>/);
    expect(heading).not.toBeNull();
    expect(heading?.[1]).toMatch(/\bline-clamp-2\b/);
  });
});
