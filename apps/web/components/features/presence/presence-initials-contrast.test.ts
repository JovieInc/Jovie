import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(
  join(
    process.cwd(),
    'components/features/presence/presence-workspace.module.css'
  ),
  'utf8'
);

describe('presence initials contrast', () => {
  it('keeps missing and generic avatars fully opaque', () => {
    const block = css.match(
      /\.profilePhoto\[data-photo-kind="missing"\],\s*\.profilePhoto\[data-photo-kind="generic"\]\s*\{[^}]*\}/
    );
    expect(block?.[0]).toMatch(/opacity:\s*1\s*;/);
    expect(block?.[0]).not.toMatch(/opacity:\s*0\.35/);
  });
});
