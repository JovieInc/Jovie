import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ArtistRuleView } from '@/lib/artist-rules/types';

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

const artistRule: ArtistRuleView = {
  id: 'rule-1',
  category: 'visual',
  ruleKey: 'palette',
  instruction: 'never use yellow; make blue primary',
  strength: 'hard_constraint',
  scope: 'artist',
  scopeValue: null,
  allowOverride: false,
  status: 'active',
  provenanceSource: 'artist',
  confirmedAt: '2026-08-28T12:00:00.000Z',
  createdAt: '2026-08-28T12:00:00.000Z',
};

describe('LibraryPageClient stages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    search.value = '';
  });

  it('presents All / Ideas / In Progress / Out instead of a separate Ideas destination', () => {
    render(<LibraryPageClient creatorProfileId='profile-1' merchCards={[]} />);

    expect(
      screen.getByRole('tablist', { name: 'Library Stages' })
    ).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'All' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByTestId('library-stage-tabs')).toHaveAttribute(
      'data-youtube-connected',
      'false'
    );
    expect(screen.queryByRole('tab', { name: 'Ideas & Scripts' })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Assets' })).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Ideas' }));
    expect(replace).toHaveBeenCalledWith('/app/library?stage=idea', {
      scroll: false,
    });
  });

  it('exposes artist rule controls from the library toolbar', async () => {
    render(
      <LibraryPageClient
        creatorProfileId='profile-1'
        merchCards={[]}
        initialArtistRules={[artistRule]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Artist Rules' }));

    expect(await screen.findByText(artistRule.instruction)).toBeInTheDocument();
    expect(screen.getByText(/Cannot be overridden/)).toBeInTheDocument();
  });

  it('restores the Ideas stage from the URL, including the legacy documents section', () => {
    search.value = 'section=documents';
    render(<LibraryPageClient creatorProfileId='profile-1' merchCards={[]} />);

    expect(screen.getByRole('tab', { name: 'Ideas' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Catalog panel');
  });

  it('uses roving focus and arrow keys across stage tabs', () => {
    render(<LibraryPageClient creatorProfileId='profile-1' merchCards={[]} />);

    const all = screen.getByRole('tab', { name: 'All' });
    const ideas = screen.getByRole('tab', { name: 'Ideas' });
    expect(all).toHaveAttribute('tabindex', '0');
    expect(ideas).toHaveAttribute('tabindex', '-1');

    all.focus();
    fireEvent.keyDown(all, { key: 'ArrowRight' });

    expect(ideas).toHaveFocus();
    expect(replace).toHaveBeenCalledWith('/app/library?stage=idea', {
      scroll: false,
    });
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
