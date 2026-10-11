import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { OpportunityInboxCardViewModel } from '@/lib/connectors/opportunity-inbox-types';
import { OpportunityInboxSocialReplyCard } from './OpportunityInboxSocialReplyCard';

const CARD: OpportunityInboxCardViewModel = {
  id: 'reply-1',
  sourceKind: 'social_reply.draft',
  signalType: 'fan_reply',
  typeLabel: 'Fan Reply',
  createdAt: '2026-09-30T10:00:00.000Z',
  title: 'Reply to Maya on Instagram',
  why: 'Drafted from your saved tone profile.',
  primaryActionLabel: 'Approve Reply',
  status: 'pending',
  category: 'social_reply',
  socialReply: {
    platform: 'Instagram',
    authorLabel: '@maya.wav',
    typeLabel: 'Collab Request',
    inboundText: 'Loved the new track — would you be down to collab?',
    draftedText: 'Thank you so much! Dropping you a DM about collab windows.',
    sourceUrl: 'https://instagram.com/p/abc123',
    executionState: 'pending',
    revisionCount: 0,
  },
};

function renderCard(
  overrides: Partial<Parameters<typeof OpportunityInboxSocialReplyCard>[0]> = {}
) {
  return render(
    <OpportunityInboxSocialReplyCard
      card={CARD}
      onApprove={vi.fn()}
      onDismiss={vi.fn()}
      onRevise={vi.fn()}
      {...overrides}
    />
  );
}

describe('OpportunityInboxSocialReplyCard', () => {
  it('renders provenance, inbound quote, draft copy, and source link', () => {
    renderCard();

    expect(screen.getByRole('article')).toHaveAttribute(
      'data-testid',
      'opportunity-inbox-card-reply-1'
    );
    expect(screen.getByText('Reply to Maya on Instagram')).toBeInTheDocument();
    expect(screen.getByText('Collab Request')).toBeInTheDocument();
    expect(screen.getByText('Instagram')).toBeInTheDocument();
    expect(
      screen.getByTestId('social-reply-inbound-reply-1')
    ).toHaveTextContent(
      '@maya.wav: Loved the new track — would you be down to collab?'
    );
    expect(screen.getByTestId('social-reply-draft-reply-1')).toHaveTextContent(
      'Thank you so much! Dropping you a DM about collab windows.'
    );
    expect(screen.getByRole('link', { name: 'View original' })).toHaveAttribute(
      'href',
      'https://instagram.com/p/abc123'
    );
  });

  it('fires approve and dismiss handlers with the card id', async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn();
    const onDismiss = vi.fn();
    renderCard({ onApprove, onDismiss });

    await user.click(screen.getByRole('button', { name: /Approve Reply/ }));
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(onApprove).toHaveBeenCalledWith('reply-1');
    expect(onDismiss).toHaveBeenCalledWith('reply-1');
  });

  it('submits revision feedback and preserves input until the replacement is committed', async () => {
    const user = userEvent.setup();
    const onRevise = vi.fn();
    renderCard({ onRevise });

    const reviseToggle = screen.getByRole('button', { name: 'Revise' });
    const submit = screen.getByRole('button', { name: 'Request revision' });
    expect(reviseToggle).toHaveAttribute('aria-expanded', 'false');
    expect(submit).toBeDisabled();

    await user.click(reviseToggle);
    expect(reviseToggle).toHaveAttribute('aria-expanded', 'true');

    const field = screen.getByLabelText('Revision feedback for Jovie');
    await user.type(field, 'Make it warmer');
    expect(submit).toBeEnabled();

    await user.click(submit);
    expect(onRevise).toHaveBeenCalledWith('reply-1', 'Make it warmer');
    expect(field).toHaveValue('Make it warmer');
    expect(reviseToggle).toHaveAttribute('aria-expanded', 'true');
  });

  it('surfaces the execution state label when mapped', () => {
    renderCard({
      card: {
        ...CARD,
        socialReply: {
          ...CARD.socialReply!,
          executionState: 'ambiguous',
        },
      },
    });

    expect(
      screen.getByTestId('social-reply-execution-ambiguous')
    ).toHaveTextContent('Needs Review');
  });

  it('shows the draft revision counter after a revise loop', () => {
    renderCard({
      card: {
        ...CARD,
        socialReply: { ...CARD.socialReply!, revisionCount: 1 },
      },
    });

    expect(screen.getByTestId('social-reply-draft-reply-1')).toHaveTextContent(
      'revision 2'
    );
  });

  it('renders video title and like count when present on the reply', () => {
    renderCard({
      card: {
        ...CARD,
        socialReply: {
          ...CARD.socialReply!,
          platform: 'YouTube',
          videoTitle: 'Midnight Run (Official Video)',
          likeCount: 42,
        },
      },
    });

    expect(screen.getByTestId('social-reply-video-reply-1')).toHaveTextContent(
      'Midnight Run (Official Video)'
    );
    expect(screen.getByText('42 likes')).toBeInTheDocument();
  });

  it('uses the singular like label for a single like', () => {
    renderCard({
      card: {
        ...CARD,
        socialReply: { ...CARD.socialReply!, likeCount: 1 },
      },
    });

    expect(screen.getByText('1 like')).toBeInTheDocument();
  });

  it('omits video and like metadata when absent', () => {
    renderCard();

    expect(
      screen.queryByTestId('social-reply-video-reply-1')
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/likes?$/)).not.toBeInTheDocument();
  });

  it('renders nothing when the card lacks social reply data', () => {
    const { container } = renderCard({
      card: { ...CARD, socialReply: undefined },
    });

    expect(container).toBeEmptyDOMElement();
  });
});
