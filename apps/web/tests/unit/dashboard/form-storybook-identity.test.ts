import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const storyFiles = [
  '../../../components/features/dashboard/organisms/ListenNowForm.stories.tsx',
  '../../../components/features/dashboard/organisms/listen-now-form/ListenNowForm.stories.tsx',
  '../../../components/features/dashboard/organisms/ProfileForm.stories.tsx',
  '../../../components/features/dashboard/organisms/profile-form/ProfileForm.stories.tsx',
] as const;

function storyTitle(relativePath: (typeof storyFiles)[number]) {
  const source = readFileSync(
    fileURLToPath(new URL(relativePath, import.meta.url)),
    'utf8'
  );
  const title = source.match(/\btitle:\s*['"]([^'"]+)['"]/u)?.[1];
  if (!title) throw new Error(`${relativePath} has no static Storybook title`);

  return title;
}

describe('dashboard form Storybook identities', () => {
  it('keeps legacy and canonical form stories on distinct identities', () => {
    const titles = storyFiles.map(storyTitle);

    expect(new Set(titles).size).toBe(titles.length);
  });
});
