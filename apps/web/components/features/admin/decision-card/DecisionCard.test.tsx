import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DecisionCardView } from '@/lib/ovie/decision-card-view';
import { DECISION_CARD_SWIPE_COMMIT_PX, DecisionCard } from './DecisionCard';
import { DECISION_CARD_STORY_STATES } from './fixtures';

const view: DecisionCardView = {
  decision: 'Price Artist Presence at $19/mo',
  fallback: {
    decision: 'approve',
    relative: 'in 31h',
    deadline: '2026-10-30T19:00:00Z',
    tone: 'calm',
    summary: 'New payers only; $12 payers keep $12.',
    conflict: false,
  },
  waiting: null,
  facts: ['Comparables: Feature.fm $19, Laylo Pro $25'],
  evidence: [
    { href: 'https://github.com/JovieInc/Jovie/pull/1', label: 'PR #1' },
  ],
};

function mount(overrides: Partial<Parameters<typeof DecisionCard>[0]> = {}) {
  const onApprove = vi.fn();
  const onReject = vi.fn();
  const onRetry = vi.fn();
  render(
    <DecisionCard
      view={view}
      status={{ kind: 'pending' }}
      discussHref='/app/ov/chat?discuss=summer-card%3Asc_1'
      onApprove={onApprove}
      onReject={onReject}
      onRetry={onRetry}
      {...overrides}
    />
  );
  return { onApprove, onReject, onRetry };
}

describe('DecisionCard', () => {
  it('renders the decision hierarchy: decision, default and deadline, facts, evidence, actions', () => {
    mount();
    const card = screen.getByTestId('decision-card');
    expect(card).toHaveAccessibleName('Price Artist Presence at $19/mo');
    expect(screen.getByTestId('decision-card-default')).toHaveTextContent(
      'Approves in 31hNew payers only; $12 payers keep $12.'
    );
    expect(screen.getByRole('link', { name: 'PR #1' })).toHaveAttribute(
      'target',
      '_blank'
    );
    expect(screen.getByRole('link', { name: 'Discuss' })).toHaveAttribute(
      'href',
      '/app/ov/chat?discuss=summer-card%3Asc_1'
    );
    const order = [
      screen.getByRole('heading'),
      screen.getByTestId('decision-card-default'),
      screen.getByTestId('decision-card-facts'),
      screen.getByTestId('decision-card-evidence'),
      screen.getByRole('button', { name: 'Approve' }),
    ];
    for (let index = 1; index < order.length; index += 1) {
      expect(
        order[index - 1]!.compareDocumentPosition(order[index]!) &
          Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
    }
  });

  it('decides through buttons, arrow keys on the decision buttons, and a committed swipe', () => {
    const { onApprove, onReject } = mount();
    const approve = screen.getByRole('button', { name: 'Approve' });
    fireEvent.click(approve);
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    fireEvent.keyDown(approve, { key: 'ArrowRight' });
    fireEvent.keyDown(approve, { key: 'ArrowLeft' });
    const card = screen.getByTestId('decision-card');
    fireEvent.pointerDown(card, {
      clientX: 300,
      pointerId: 1,
      isPrimary: true,
    });
    fireEvent.pointerMove(card, { clientX: 100, pointerId: 1 });
    fireEvent.pointerUp(card, {
      clientX: 300 - DECISION_CARD_SWIPE_COMMIT_PX - 4,
      pointerId: 1,
    });
    expect(onApprove).toHaveBeenCalledTimes(2);
    expect(onReject).toHaveBeenCalledTimes(3);
  });

  it('ignores short swipes, cancelled swipes, swipes from links and modified keys', () => {
    const { onApprove, onReject } = mount();
    const card = screen.getByTestId('decision-card');
    fireEvent.pointerDown(card, { clientX: 0, pointerId: 2, isPrimary: true });
    fireEvent.pointerUp(card, { clientX: 40, pointerId: 2 });
    fireEvent.pointerDown(card, { clientX: 0, pointerId: 3, isPrimary: true });
    fireEvent.pointerCancel(card, { clientX: 400, pointerId: 3 });
    const link = screen.getByRole('link', { name: 'Discuss' });
    fireEvent.pointerDown(link, { clientX: 0, pointerId: 4, isPrimary: true });
    fireEvent.pointerUp(card, { clientX: 400, pointerId: 4 });
    fireEvent.keyDown(screen.getByRole('button', { name: 'Approve' }), {
      key: 'ArrowRight',
      metaKey: true,
    });
    expect(onApprove).not.toHaveBeenCalled();
    expect(onReject).not.toHaveBeenCalled();
  });

  it('shows no Reject and no left swipe when the source has no reject path', () => {
    const { onApprove } = mount({ onReject: undefined });
    expect(screen.queryByRole('button', { name: 'Reject' })).toBeNull();
    const approve = screen.getByRole('button', { name: 'Approve' });
    expect(approve).toHaveAttribute('aria-keyshortcuts', 'ArrowRight');
    fireEvent.keyDown(approve, { key: 'ArrowLeft' });
    const card = screen.getByTestId('decision-card');
    fireEvent.pointerDown(card, {
      clientX: 300,
      pointerId: 5,
      isPrimary: true,
    });
    fireEvent.pointerUp(card, { clientX: 0, pointerId: 5 });
    expect(onApprove).not.toHaveBeenCalled();
  });

  it('locks actions while submitting and replaces them with the outcome once decided', () => {
    mount({ status: { kind: 'submitting', decision: 'approve' } });
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();
    expect(screen.getByTestId('decision-card')).toHaveAttribute(
      'aria-busy',
      'true'
    );
  });

  it.each([
    [{ decision: 'approve', by: 'founder' }, 'Approved'],
    [{ decision: 'reject', by: 'default' }, 'Rejected by default'],
  ] as const)('labels the %j outcome', (outcome, label) => {
    const { onApprove } = mount({ status: { kind: 'decided', ...outcome } });
    expect(screen.getByTestId('decision-card-outcome')).toHaveTextContent(
      label
    );
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    const card = screen.getByTestId('decision-card');
    fireEvent.pointerDown(card, { clientX: 0, pointerId: 6, isPrimary: true });
    fireEvent.pointerUp(card, { clientX: 400, pointerId: 6 });
    expect(onApprove).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Discuss' })).toBeInTheDocument();
  });

  it('keeps a failed write recoverable with Retry', () => {
    const { onRetry } = mount({
      status: { kind: 'error', message: 'Not recorded. Retry.' },
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Not recorded. Retry.');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('says when filed default text contradicts what the deadline records', () => {
    mount({
      view: {
        ...view,
        fallback: {
          ...view.fallback!,
          decision: 'reject',
          tone: 'near',
          summary: null,
          conflict: true,
        },
      },
    });
    const line = screen.getByTestId('decision-card-default');
    expect(line).toHaveAttribute('data-tone', 'near');
    expect(line).toHaveTextContent('Rejects in 31h');
    expect(line).toHaveTextContent('Filed default text says otherwise');
  });

  it('shows how long a no-default decision has waited', () => {
    mount({
      view: { ...view, fallback: null, waiting: { hours: 26, level: 1 } },
    });
    expect(screen.getByTestId('decision-card-default')).toHaveTextContent(
      'Waiting 26hNo default'
    );
  });
});

describe('DecisionCard design-system conformance', () => {
  const source = readFileSync(join(__dirname, 'DecisionCard.tsx'), 'utf8');
  const classNames = [...source.matchAll(/className=['"`{]([^'"`}]*)/gu)]
    .map(match => match[1])
    .join(' ');

  it('uses semantic tokens only: no raw palette, hex or arbitrary colors', () => {
    expect(source).not.toMatch(/#[0-9a-f]{3,8}\b/iu);
    expect(classNames).not.toMatch(
      /\b(?:text|bg|border|ring|fill|stroke)-(?:black|white|gray|slate|zinc|neutral|red|green|blue|yellow|orange|purple|pink)(?:-\d+)?\b/u
    );
    expect(classNames).not.toMatch(/\[(?:#|rgb|hsl|oklch)/u);
  });

  it('has no icons, icon tiles, emoji, glass, gradients, borders or shadows on the card', () => {
    expect(source).not.toMatch(/lucide-react/u);
    expect(source).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(classNames).not.toMatch(
      /\b(?:backdrop-blur|bg-gradient|from-|shadow-|border(?:-[a-z]+)?\b|uppercase|tracking-)/u
    );
  });

  it('keeps a restrained type scale: text-sm for the decision, text-xs for everything else', () => {
    const sizes = new Set(
      classNames.match(/\btext-(?:2xs|xs|sm|base|lg|xl|\dxl|app)\b/gu)
    );
    expect([...sizes].sort()).toEqual(['text-sm', 'text-xs']);
  });

  it('has a story for every state Tim reviews', () => {
    expect(Object.keys(DECISION_CARD_STORY_STATES).sort()).toEqual(
      ['AutoShipped', 'Decided', 'Error', 'NearDeadline', 'Pending'].sort()
    );
  });
});
