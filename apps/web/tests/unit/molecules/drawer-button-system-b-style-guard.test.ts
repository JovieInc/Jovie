import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = path.resolve(__dirname, '../../..');

function readWebFile(relativePath: string) {
  return readFileSync(path.join(webRoot, relativePath), 'utf8');
}

describe('DrawerButton System B style guard', () => {
  it('keeps primary drawer actions neutral instead of accent-colored', () => {
    const source = readWebFile('components/molecules/drawer/DrawerButton.tsx');

    expect(source).toContain('bg-btn-primary');
    expect(source).toContain('text-btn-primary-foreground');
    expect(source).toContain('hover:bg-btn-primary-hover');
    expect(source).not.toContain('--linear-accent');
    expect(source).not.toContain('text-white');
    expect(source).not.toContain('duration-150');
    expect(source).not.toMatch(/\brgba?\(/i);
  });
});
