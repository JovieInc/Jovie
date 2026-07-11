import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DesignProposalReviewPanel } from '@/components/features/admin/design-lab';
import { PROPOSED_SECTIONS } from '@/data/marketing';
import { DesignProposalSchema } from '@/lib/agent-os/design-lab/types';

vi.mock('@/components/feedback', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const proposal = DesignProposalSchema.parse({
  id: PROPOSED_SECTIONS[0].id,
  kind: 'section-gap',
  surfaceId: 'section-gap:feature-split',
  surfaceName: PROPOSED_SECTIONS[0].proposedSectionName,
  proposalText: PROPOSED_SECTIONS[0].problem,
  assetRefs: [],
  scoring: null,
  linearIssueId: 'UNASSIGNED',
  linearIssueUrl: null,
  status: PROPOSED_SECTIONS[0].status,
  designGap: PROPOSED_SECTIONS[0],
  createdAt: '2026-07-11T00:00:00.000Z',
  reviewedAt: null,
  reviewer: null,
  reviewNotes: null,
  dayBucket: '2026-07-11',
});

describe('DesignProposalReviewPanel', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ proposals: [proposal] }), {
          status: 200,
        })
      )
    );
  });

  it('shows stable review identity, status, route, and both wireframes', async () => {
    render(<DesignProposalReviewPanel />);
    expect(await screen.findAllByText('PROPOSED-SECTION-0001')).toHaveLength(2);
    expect(screen.getByText('Proposed')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /artist-notifications/ })
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('design-lab-wireframe-desktop')
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Mobile' }));
    expect(
      screen.getByTestId('design-lab-wireframe-mobile')
    ).toBeInTheDocument();
  });

  it('renders a retry action after a load error', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Catalog failed' }), { status: 500 })
    );
    render(<DesignProposalReviewPanel />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Catalog failed'
    );
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  });

  it('submits compact feedback without removing the selected workspace', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ proposals: [proposal] }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ proposal }), { status: 200 })
      );
    render(<DesignProposalReviewPanel />);
    const input = await screen.findByLabelText('Compact Feedback');
    fireEvent.change(input, {
      target: { value: 'PROPOSED-SECTION-0001: Keep the selector stable.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add Comment' }));
    expect(
      await screen.findByText('Comment appended to the review history.')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('design-lab-wireframe-desktop')
    ).toBeInTheDocument();
  });

  it('adds the section-gap kind only when the dedicated gallery requests it', async () => {
    render(<DesignProposalReviewPanel kind='section-gap' />);
    await screen.findAllByText('PROPOSED-SECTION-0001');
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('kind=section-gap'),
      expect.any(Object)
    );
  });
});
