import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  ReleaseCatalogPageClient: () => <div>Assets panel</div>,
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

describe('LibraryPageClient sections', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    search.value = '';
  });

  it('uses accessible tabs and persists the document section in the URL', () => {
    render(<LibraryPageClient creatorProfileId='profile-1' merchCards={[]} />);

    expect(screen.getByRole('tab', { name: 'Assets' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Ideas & Scripts' }));
    expect(replace).toHaveBeenCalledWith('/app/library?section=documents', {
      scroll: false,
    });
  });

  it('restores the document panel from the URL', () => {
    search.value = 'section=documents';
    render(<LibraryPageClient creatorProfileId='profile-1' merchCards={[]} />);

    expect(
      screen.getByRole('tab', { name: 'Ideas & Scripts' })
    ).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Documents panel');
  });

  it('uses roving focus and arrow keys across library tabs', () => {
    render(<LibraryPageClient creatorProfileId='profile-1' merchCards={[]} />);

    const assets = screen.getByRole('tab', { name: 'Assets' });
    const documents = screen.getByRole('tab', { name: 'Ideas & Scripts' });
    expect(assets).toHaveAttribute('tabindex', '0');
    expect(documents).toHaveAttribute('tabindex', '-1');

    assets.focus();
    fireEvent.keyDown(assets, { key: 'ArrowRight' });

    expect(documents).toHaveFocus();
    expect(replace).toHaveBeenCalledWith('/app/library?section=documents', {
      scroll: false,
    });
  });

  it('guards leaving the document section with an unsaved draft', () => {
    search.value = 'section=documents';
    render(<LibraryPageClient creatorProfileId='profile-1' merchCards={[]} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Mark document dirty' })
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Assets' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(replace).not.toHaveBeenCalled();
    expect(discardDrafts).not.toHaveBeenCalled();
  });

  it('purges persisted drafts after confirmed destructive navigation', () => {
    search.value = 'section=documents';
    render(<LibraryPageClient creatorProfileId='profile-1' merchCards={[]} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Mark document dirty' })
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Assets' }));
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));

    expect(discardDrafts).toHaveBeenCalledOnce();
    expect(replace).toHaveBeenCalledWith('/app/library', { scroll: false });
  });
});
