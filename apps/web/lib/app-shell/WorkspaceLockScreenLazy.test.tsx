import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/features/workspace-lock/WorkspaceLockScreen', () => ({
  WorkspaceLockScreen: () => <h1>Unlock Ovie</h1>,
}));

import { WorkspaceLockScreenLazy } from './WorkspaceLockScreenLazy';

describe('WorkspaceLockScreenLazy', () => {
  it('renders the lock screen once its chunk loads', async () => {
    render(<WorkspaceLockScreenLazy />);

    expect(
      await screen.findByRole('heading', { name: 'Unlock Ovie' })
    ).toBeInTheDocument();
  });

  it('keeps server rendering so a locked first paint shows the lock screen', () => {
    const source = readFileSync(
      resolve(__dirname, './WorkspaceLockScreenLazy.tsx'),
      'utf8'
    );

    expect(source).toContain(
      "import('@/features/workspace-lock/WorkspaceLockScreen')"
    );
    expect(source).not.toContain('ssr: false');
  });

  it('is the only way the shell boundary loads the lock screen', () => {
    const boundary = readFileSync(
      resolve(
        __dirname,
        '../../app/app/(shell)/DashboardShellPrivacyBoundary.tsx'
      ),
      'utf8'
    );

    expect(boundary).toContain('WorkspaceLockScreenLazy');
    expect(boundary).not.toContain(
      "from '@/features/workspace-lock/WorkspaceLockScreen'"
    );
  });
});
