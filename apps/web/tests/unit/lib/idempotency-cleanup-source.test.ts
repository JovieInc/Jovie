import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const appRoot = resolve(__dirname, '../../..');

describe('idempotency cleanup source contract', () => {
  it('does not keep test workers alive with a refed cleanup interval', () => {
    const source = readFileSync(resolve(appRoot, 'lib/idempotency.ts'), 'utf8');

    expect(source).toContain('setInterval(');
    expect(source).toContain('cleanupTimer.unref?.()');
  });
});
