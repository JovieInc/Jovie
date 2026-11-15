import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminLeadKeyword } from '@/lib/queries';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { LeadKeywordsManager } from './LeadKeywordsManager';

const toastError = vi.fn();
const toastSuccess = vi.fn();
const addKeywords = vi.fn();
const seedKeywords = vi.fn();
const toggleKeyword = vi.fn();
const deleteKeyword = vi.fn();
let keywordsState: {
  data?: { keywords: AdminLeadKeyword[] };
  isLoading: boolean;
};

vi.mock('@/components/feedback', () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: (...args: unknown[]) => toastSuccess(...args),
  },
}));

vi.mock('@/lib/queries', () => ({
  queryKeys: {
    admin: { leads: { keywords: () => ['admin', 'leads', 'keywords'] } },
  },
  useLeadKeywordsQuery: () => keywordsState,
  useAddLeadKeywordsMutation: () => ({
    mutateAsync: addKeywords,
    isPending: false,
  }),
  useSeedLeadKeywordsMutation: () => ({
    mutateAsync: seedKeywords,
    isPending: false,
  }),
  useToggleLeadKeywordMutation: () => ({ mutateAsync: toggleKeyword }),
  useDeleteLeadKeywordMutation: () => ({ mutateAsync: deleteKeyword }),
}));

function keyword(index: number, query = `site:linktr.ee "music" ${index}`) {
  return {
    id: `keyword-${index}`,
    query,
    enabled: true,
    resultsFoundTotal: index * 10,
    lastUsedAt: null,
  };
}

function wrapper({ children }: { readonly children: ReactNode }) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      {children}
    </QueryClientProvider>
  );
}

describe('LeadKeywordsManager', () => {
  beforeEach(() => {
    for (const mock of [
      toastError,
      toastSuccess,
      addKeywords,
      seedKeywords,
      toggleKeyword,
      deleteKeyword,
    ])
      mock.mockReset();
    keywordsState = { data: { keywords: [keyword(1)] }, isLoading: false };
  });

  it('shows the loading line while keywords load', async () => {
    keywordsState = { isLoading: true };
    const { container } = render(<LeadKeywordsManager />, { wrapper });

    expect(screen.getByText('Loading keywords...')).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('shows the zero count with no rows when nothing is configured', async () => {
    keywordsState = { data: { keywords: [] }, isLoading: false };
    const { container } = render(<LeadKeywordsManager />, { wrapper });

    expect(screen.getByText(/0 keywords configured\./)).toBeVisible();
    expect(screen.queryByRole('switch')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('adds one keyword per non-blank line and clears the field', async () => {
    const user = userEvent.setup();
    addKeywords.mockResolvedValue({ count: 2 });
    const { container } = render(<LeadKeywordsManager />, { wrapper });

    await user.type(
      screen.getByLabelText('New Discovery Keywords'),
      ' a {enter}{enter}b'
    );
    await user.click(screen.getByRole('button', { name: 'Add Keywords' }));

    expect(addKeywords).toHaveBeenCalledWith(['a', 'b']);
    await waitFor(() =>
      expect(screen.getByLabelText('New Discovery Keywords')).toHaveValue('')
    );
    expect(toastSuccess).toHaveBeenCalledWith('Added 2 keywords');
    await expectNoA11yViolations(container);
  });

  it('keeps the typed keywords when adding fails', async () => {
    const user = userEvent.setup();
    addKeywords.mockRejectedValue(new Error('nope'));
    render(<LeadKeywordsManager />, { wrapper });

    await user.type(screen.getByLabelText('New Discovery Keywords'), 'a');
    await user.click(screen.getByRole('button', { name: 'Add Keywords' }));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('Failed to add keywords')
    );
    expect(screen.getByLabelText('New Discovery Keywords')).toHaveValue('a');
  });

  it('toggles, deletes and seeds keywords, reporting failures', async () => {
    const user = userEvent.setup();
    toggleKeyword.mockRejectedValue(new Error('offline'));
    deleteKeyword.mockResolvedValue({});
    seedKeywords.mockResolvedValue({ result: { inserted: 3, skipped: 1 } });
    render(<LeadKeywordsManager embedded />, { wrapper });

    await user.click(
      screen.getByRole('switch', { name: `Toggle ${keyword(1).query}` })
    );
    expect(toggleKeyword).toHaveBeenCalledWith({
      id: 'keyword-1',
      enabled: false,
    });
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('Failed to toggle keyword')
    );

    await user.click(screen.getByTitle('Delete Keyword'));
    expect(deleteKeyword).toHaveBeenCalledWith('keyword-1');
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith('Keyword deleted')
    );

    await user.click(screen.getByRole('button', { name: 'Seed Feature.fm' }));
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith(
        'Seeded 3 Feature.fm keywords (1 already existed)'
      )
    );
    expect(screen.getByText('1 configured')).toBeVisible();
  });

  it('keeps typed keywords and focus across a re-render and Escape', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<LeadKeywordsManager />, { wrapper });

    await user.type(screen.getByLabelText('New Discovery Keywords'), 'draft');
    rerender(<LeadKeywordsManager embedded={false} />);
    await user.keyboard('{Escape}');

    expect(screen.getByLabelText('New Discovery Keywords')).toHaveValue(
      'draft'
    );
    expect(screen.getByLabelText('New Discovery Keywords')).toHaveFocus();
  });

  it('stays axe-clean with long and right-to-left queries', async () => {
    keywordsState = {
      data: {
        keywords: [
          keyword(1, 'site:linktr.ee "موسيقى" "سبوتيفاي"'),
          keyword(2, `site:linktr.ee "${'independent producer '.repeat(6)}"`),
        ],
      },
      isLoading: false,
    };
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <LeadKeywordsManager />
      </div>,
      { wrapper }
    );

    expect(
      screen.getByText('site:linktr.ee "موسيقى" "سبوتيفاي"')
    ).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
