import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AppFlagProvider } from '@/lib/flags/client';
import { APP_FLAG_DEFAULTS } from '@/lib/flags/contracts';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { CmdKPalette } from './CmdKPalette';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn(), replace: vi.fn() }),
}));
vi.mock('next/image', () => ({
  default: ({ alt, src }: { alt: string; src: string }) => (
    <span data-testid='img' data-src={src} data-alt={alt} />
  ),
}));
vi.mock('@/lib/queries/useReleasesQuery', () => ({
  useReleasesQuery: () => ({ data: [], isLoading: false }),
}));
vi.mock('@/lib/queries/useArtistSearchQuery', () => ({
  useArtistSearchQuery: () => ({
    results: [],
    state: 'idle',
    error: null,
    query: '',
    isPending: false,
    search: vi.fn(),
    searchImmediate: vi.fn(),
    clear: vi.fn(),
  }),
}));
vi.mock('@/lib/queries/useChatCapabilitiesQuery', () => ({
  useChatCapabilitiesQuery: () => ({
    data: undefined,
    isLoading: false,
    isError: false,
  }),
}));

function Harness({ presentation }: { presentation: 'dialog' | 'main' }) {
  const [header, setHeader] = useState<ReactNode>(null);
  const [open, setOpen] = useState(true);
  return (
    <AppFlagProvider initialFlags={APP_FLAG_DEFAULTS}>
      <header>{header}</header>
      <button type='button' onClick={() => setOpen(true)}>
        Reopen palette
      </button>
      <CmdKPalette
        profileId='profile-1'
        open={open}
        onOpenChange={setOpen}
        presentation={presentation}
        onHeaderChange={setHeader}
      />
    </AppFlagProvider>
  );
}

describe('CmdKPalette certificate', () => {
  it('has no axe violations in the main presentation and clears the query on close', async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness presentation='main' />);
    const input = await screen.findByRole('combobox', {
      name: 'Command Palette Search',
    });
    await expectNoA11yViolations(container);
    await user.type(input, 'zzzz-no-match');
    expect(input).toHaveValue('zzzz-no-match');
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Reopen palette' }));
    expect(
      await screen.findByRole('combobox', { name: 'Command Palette Search' })
    ).toHaveValue('');
  });

  it('has no axe violations in the dialog presentation', async () => {
    render(<Harness presentation='dialog' />);
    const input = await screen.findByRole('combobox', {
      name: 'Command Palette Search',
    });
    expect(input).toHaveFocus();
    await expectNoA11yViolations(document.body);
  });
});
