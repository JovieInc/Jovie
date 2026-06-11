import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const appRoot = resolve(__dirname, '../../..');
const founderDemoSourcePath =
  'components/features/demo/FounderDemoRecordingSurface.tsx';

describe('Founder demo System B source contract', () => {
  it('keeps the approval CTA on neutral primary button tokens', () => {
    const source = readFileSync(
      resolve(appRoot, founderDemoSourcePath),
      'utf8'
    );

    expect(source).not.toContain('h-8 w-full rounded-md bg-primary-token');
    expect(source).not.toContain('hover:opacity-90');

    expect(source).toContain('h-8 w-full rounded-md');
    expect(source).toContain('border-(--linear-btn-primary-border)');
    expect(source).toContain('bg-btn-primary');
    expect(source).toContain('text-btn-primary-foreground');
    expect(source).toContain('hover:bg-btn-primary-hover');
  });
});
