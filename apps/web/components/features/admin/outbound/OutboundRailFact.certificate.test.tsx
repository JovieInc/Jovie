import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ContactEvidenceItem } from '@/lib/contacts/certification';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { OutboundRailFact } from './OutboundRailFact';

const item: ContactEvidenceItem = {
  key: 'canonical:display-name',
  revision: 'synthetic-revision',
  category: 'identity',
  label: 'Display name',
  value: 'Ada | Instagram, Spotify',
  url: 'https://example.com/ada',
  source: 'public link page',
  observedAt: '2026-10-01T00:00:00Z',
  confidence: 0.8,
  rationale: 'Name observed on the linked page.',
  freshness: 'fresh',
  decision: null,
};

function fact(overrides: Partial<ContactEvidenceItem> = {}, pending = false) {
  return (
    <OutboundRailFact
      item={{ ...item, ...overrides }}
      active={false}
      pending={pending}
      onDecision={vi.fn(async () => {})}
    />
  );
}

describe('OutboundRailFact certificate', () => {
  it('keeps a typed correction and focus across a rerender and blur', async () => {
    const user = userEvent.setup();
    const { rerender, container } = render(fact());
    const input = screen.getByLabelText('Correct Display name');
    await user.type(input, 'Ada Artist');
    rerender(fact());
    expect(screen.getByLabelText('Correct Display name')).toHaveValue(
      'Ada Artist'
    );
    expect(screen.getByLabelText('Correct Display name')).toHaveFocus();
    await user.tab();
    expect(screen.getByLabelText('Correct Display name')).toHaveValue(
      'Ada Artist'
    );
    await expectNoA11yViolations(container);
  });

  it('shows the missing-correction error and clears it once typing starts', async () => {
    const user = userEvent.setup();
    const { container } = render(fact());
    await user.click(screen.getByRole('button', { name: 'Save Correction' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Enter a correction before saving.'
    );
    await expectNoA11yViolations(container);
    await user.type(screen.getByLabelText('Correct Display name'), 'A');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('stays axe-clean while pending, empty and right-to-left', async () => {
    const pending = render(fact({}, true));
    expect(screen.getByRole('button', { name: 'Yes' })).toBeDisabled();
    await expectNoA11yViolations(pending.container);
    pending.unmount();
    const empty = render(fact({ value: '' }));
    expect(screen.getByText('No value recorded')).toBeVisible();
    await expectNoA11yViolations(empty.container);
    empty.unmount();
    const rtl = render(fact({ label: 'الاسم', value: 'عدا | إنستغرام' }));
    expect(screen.getByText('عدا | إنستغرام')).toBeVisible();
    await expectNoA11yViolations(rtl.container);
  });
});
