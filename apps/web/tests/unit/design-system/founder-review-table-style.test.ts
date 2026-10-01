import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('founder review table geometry', () => {
  it('reserves a stable table viewport and prevents intrinsic content from moving columns off-canvas', () => {
    const css = readFileSync(
      resolve(process.cwd(), 'styles/system-b-app.css'),
      'utf8'
    );

    expect(css).toMatch(
      /:where\(\.system-b-founder-review-table-shell\)[\s\S]*height: min\(35rem, calc\(100vh - 19rem\)\);[\s\S]*min-height: 28rem;/
    );
    expect(css).toMatch(
      /:where\(\.system-b-founder-review-table\)[\s\S]*width: 100%;[\s\S]*table-layout: fixed;/
    );
  });
});
