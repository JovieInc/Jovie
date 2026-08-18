import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { replace, search } = vi.hoisted(() => ({
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
  CreatorDocumentsWorkspace: () => <div>Documents panel</div>,
}));

import { LibraryPageClient } from './LibraryPageClient';

describe('LibraryPageClient sections', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    search.value = '';
  });

  it('uses accessible tabs and persists the document section in the URL', () => {
    render(<LibraryPageClient merchCards={[]} />);

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
    render(<LibraryPageClient merchCards={[]} />);

    expect(
      screen.getByRole('tab', { name: 'Ideas & Scripts' })
    ).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Documents panel');
  });

  it('uses roving focus and arrow keys across library tabs', () => {
    render(<LibraryPageClient merchCards={[]} />);

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
});
