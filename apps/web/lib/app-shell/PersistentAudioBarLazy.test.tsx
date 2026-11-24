import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/organisms/PersistentAudioBar', () => ({
  PersistentAudioBar: () => <section aria-label='Now playing' />,
}));

import { PersistentAudioBarLazy } from './PersistentAudioBarLazy';

describe('PersistentAudioBarLazy', () => {
  it('mounts the audio bar on the client once its chunk loads', async () => {
    render(<PersistentAudioBarLazy />);

    expect(
      await screen.findByRole('region', { name: 'Now playing' })
    ).toBeInTheDocument();
  });

  it('keeps the player out of the shell layout and AuthShell initial JS', () => {
    const read = (path: string) =>
      readFileSync(resolve(__dirname, path), 'utf8');
    const layout = read('../../app/app/(shell)/layout.tsx');
    const authShell = read('../../components/organisms/AuthShell.tsx');

    for (const source of [layout, authShell]) {
      expect(source).toContain('PersistentAudioBarLazy');
      expect(source).not.toMatch(/from '[^']*\/PersistentAudioBar'/);
    }
    expect(read('./PersistentAudioBarLazy.tsx')).toContain('ssr: false');
  });
});
