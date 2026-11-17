import { TooltipProvider } from '@jovie/ui';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { DetectedLink } from '@/lib/utils/platform-detection';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { renderWithQueryClient } from '@/tests/utils/test-utils';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/app/profile',
  useSearchParams: () => new URLSearchParams(),
}));

import { GroupedLinksManager } from './GroupedLinksManager';

const instagram: DetectedLink = {
  platform: {
    id: 'instagram',
    name: 'Instagram',
    category: 'social',
    icon: 'instagram',
    color: '#C13584',
    placeholder: 'https://instagram.com/user',
  },
  normalizedUrl: 'https://instagram.com/sasha',
  originalUrl: 'https://instagram.com/sasha',
  suggestedTitle: 'Instagram',
  isValid: true,
};

function renderManager(
  props: Partial<ComponentProps<typeof GroupedLinksManager>> = {},
  dir?: 'rtl'
) {
  return renderWithQueryClient(
    <TooltipProvider>
      <div dir={dir}>
        <GroupedLinksManager initialLinks={[]} {...props} />
      </div>
    </TooltipProvider>
  );
}

const urlInput = () => screen.getByLabelText('Link URL');

describe('GroupedLinksManager', () => {
  it('shows the first-link empty state with quick-add pills', async () => {
    const { container } = renderManager();

    expect(
      screen.getByRole('heading', { name: 'Add your first link' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: 'Quick link suggestions' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('prefills the input when a quick-add platform is picked', async () => {
    const user = userEvent.setup();
    const { container } = renderManager();

    await user.click(screen.getByRole('button', { name: /^Select Instagram/ }));

    await waitFor(() =>
      expect((urlInput() as HTMLInputElement).value).toMatch(/instagram/i)
    );
    await expectNoA11yViolations(container);
  });

  it('opens and exits the Spotify artist search from its pill', async () => {
    const user = userEvent.setup();
    const { container } = renderManager();

    await user.click(
      screen.getByRole('button', { name: /^Select Spotify Artist/ })
    );

    expect(
      await screen.findByRole('combobox', { name: 'Search Spotify artists' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole('button', { name: 'Exit Search Mode' }));

    await waitFor(() => expect(urlInput()).toBeInTheDocument());
    expect(
      screen.queryByRole('combobox', { name: 'Search Spotify artists' })
    ).toBeNull();
  });

  it('reports existing links on mount and hides their quick-add pill', async () => {
    const onLinksChange = vi.fn();
    const { container } = renderManager({
      initialLinks: [instagram],
      onLinksChange,
    });

    expect(onLinksChange).toHaveBeenCalledWith([
      expect.objectContaining({ normalizedUrl: 'https://instagram.com/sasha' }),
    ]);
    expect(
      screen.getByRole('region', { name: 'Links List' })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^Select Instagram/ })
    ).toBeNull();
    expect(
      screen.queryByRole('heading', { name: 'Add your first link' })
    ).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('adds a pasted platform link', async () => {
    const user = userEvent.setup();
    const onLinkAdded = vi.fn();
    const { container } = renderManager({ onLinkAdded });

    await user.type(urlInput(), 'https://open.spotify.com/artist/abc123');
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => expect(onLinkAdded).toHaveBeenCalled(), {
      timeout: 3000,
    });
    const added = onLinkAdded.mock.calls.at(-1)?.[0] as DetectedLink[];
    expect(added.map(link => link.platform.id)).toContain('spotify');
    await expectNoA11yViolations(container);
  });

  it('shows the profile prompt instead of the empty state when the sidebar is open', async () => {
    const { container } = renderManager({ sidebarOpen: true });

    expect(
      screen.getByText('What other profiles do you have?')
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Add your first link' })
    ).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('stays accessible in a right-to-left document', async () => {
    const { container } = renderManager({ initialLinks: [instagram] }, 'rtl');

    expect(urlInput()).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
