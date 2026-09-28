import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';

const { discardDrafts, replace, search } = vi.hoisted(() => ({
  discardDrafts: vi.fn(),
  replace: vi.fn(),
  search: { value: '' },
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/app/library',
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(search.value),
}));
vi.mock('../dashboard/releases/ReleaseCatalogPageClient', () => ({
  ReleaseCatalogPageClient: () => <div>Catalog panel</div>,
}));
vi.mock('./CreatorDocumentsWorkspace', () => ({
  CreatorDocumentsWorkspace: ({
    onUnsavedDraftChange,
    onDiscardDraftsReady,
  }: {
    onUnsavedDraftChange: (hasDraft: boolean) => void;
    onDiscardDraftsReady: (discard: () => void) => void;
  }) => {
    onDiscardDraftsReady(discardDrafts);
    return (
      <div>
        Documents panel
        <button type='button' onClick={() => onUnsavedDraftChange(true)}>
          Mark document dirty
        </button>
      </div>
    );
  },
}));

import { LibraryPageClient } from './LibraryPageClient';

describe('LibraryPageClient stages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    search.value = '';
  });

  it('keeps catalog chrome on a single toolbar by omitting a competing stage row', () => {
    render(<LibraryPageClient creatorProfileId='profile-1' merchCards={[]} />);

    expect(
      screen.queryByRole('tablist', { name: 'Library Stages' })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Artist Rules' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Import YouTube' })).toBeNull();
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Catalog panel');
  });

  it('sends artist-rule deep links to settings', () => {
    search.value = 'rules=1';
    render(<LibraryPageClient creatorProfileId='profile-1' merchCards={[]} />);

    expect(replace).toHaveBeenCalledWith(
      `${APP_ROUTES.SETTINGS_ARTIST_PROFILE}?rules=1`
    );
  });

  it('restores the Ideas stage from the URL, including the legacy documents section', () => {
    search.value = 'section=documents';
    render(<LibraryPageClient creatorProfileId='profile-1' merchCards={[]} />);

    expect(screen.getByRole('tabpanel')).toHaveTextContent('Catalog panel');
  });

  it('guards leaving a document editor with an unsaved draft', () => {
    search.value = 'document=doc-1';
    render(<LibraryPageClient creatorProfileId='profile-1' merchCards={[]} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Mark document dirty' })
    );

    fireEvent.click(screen.getByRole('tab', { name: 'All' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(replace).not.toHaveBeenCalled();
    expect(discardDrafts).not.toHaveBeenCalled();
  });

  it('purges persisted drafts after confirmed destructive navigation', () => {
    search.value = 'document=doc-1';
    render(<LibraryPageClient creatorProfileId='profile-1' merchCards={[]} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Mark document dirty' })
    );

    fireEvent.click(screen.getByRole('tab', { name: 'All' }));
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));

    expect(discardDrafts).toHaveBeenCalledOnce();
    expect(replace).toHaveBeenCalledWith('/app/library', { scroll: false });
  });
});
