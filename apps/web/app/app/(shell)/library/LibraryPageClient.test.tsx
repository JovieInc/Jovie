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
    fireEvent.click(screen.getByRole('tab', { name: 'Ideas & scripts' }));
    expect(replace).toHaveBeenCalledWith('/app/library?section=documents', {
      scroll: false,
    });
  });

  it('restores the document panel from the URL', () => {
    search.value = 'section=documents';
    render(<LibraryPageClient merchCards={[]} />);

    expect(
      screen.getByRole('tab', { name: 'Ideas & scripts' })
    ).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Documents panel');
  });
});
