import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ContactEvidenceItem } from '@/lib/contacts/certification';
import {
  OutboundRailFact,
  type OutboundRailFactProps,
} from './OutboundRailFact';

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

function renderFact(overrides: Partial<OutboundRailFactProps> = {}) {
  return render(
    <OutboundRailFact
      item={item}
      active={false}
      pending={false}
      onDecision={vi.fn()}
      {...overrides}
    />
  );
}

describe('OutboundRailFact', () => {
  it('keeps provenance, audit evidence and correction inline without disclosures', () => {
    renderFact();
    expect(screen.getByText(/public link page/)).toBeVisible();
    expect(screen.getByText(item.rationale)).toBeVisible();
    expect(screen.getByText(/synthetic-revision/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Open source' })).toBeVisible();
    expect(screen.getByLabelText('Correct Display name')).toBeVisible();
    expect(
      screen.queryByRole('button', { expanded: false })
    ).not.toBeInTheDocument();
  });
  it('keeps unavailable provenance explicit without empty controls', () => {
    renderFact({
      item: { ...item, source: '', observedAt: null, url: null, rationale: '' },
    });
    expect(
      screen.getByText('Source unknown · Observation date unknown')
    ).toBeVisible();
    expect(
      screen.queryByRole('link', { name: 'Open source' })
    ).not.toBeInTheDocument();
    expect(screen.getByText(/synthetic-revision/)).toBeVisible();
  });
  it.each(['', 'Ada and the Midnight Orchestra | Instagram, Spotify'])(
    'keeps missing or long recorded names truthful: %s',
    value => {
      const onDecision = vi.fn();
      renderFact({ item: { ...item, value }, onDecision });
      expect(screen.getByText(value || 'Not available')).toBeVisible();
      if (!value)
        expect(
          screen.queryByText(/Suggested display:/)
        ).not.toBeInTheDocument();
      expect(onDecision).not.toHaveBeenCalled();
    }
  );
  it('does not turn a role-only import into an invented name', () => {
    const onDecision = vi.fn();
    renderFact({ item: { ...item, value: 'Hip Hop Artist | NC' }, onDecision });
    expect(screen.getByText('Hip Hop Artist | NC')).toBeVisible();
    expect(screen.queryByText(/Suggested display:/)).not.toBeInTheDocument();
    expect(onDecision).not.toHaveBeenCalled();
  });
  it('separates the recorded value from a suggestion without writing either', () => {
    const onDecision = vi.fn();
    renderFact({ active: true, onDecision });
    expect(screen.getByText(item.value)).toBeVisible();
    expect(screen.getByText('Suggested display: Ada')).toBeVisible();
    expect(screen.getByText('80% confidence')).toBeVisible();
    expect(screen.getByRole('article')).toHaveClass('bg-surface-1');
    expect(screen.getByRole('article')).toHaveAttribute('aria-current', 'true');
    expect(onDecision).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('button', { name: /Source and review details/ })
    ).not.toBeInTheDocument();
  });

  it.each(['Yes', 'No', 'Unsure'])(
    'preserves the %s decision and evidence identity',
    label => {
      const onDecision = vi.fn();
      renderFact({ onDecision });
      fireEvent.click(
        within(
          screen.getByRole('group', { name: 'Review Display name' })
        ).getByRole('button', { name: label })
      );
      expect(onDecision).toHaveBeenCalledWith(item, label.toLowerCase());
    }
  );

  it('requires explicit correction entry and save, retaining provenance and revision', () => {
    const onDecision = vi.fn();
    renderFact({ onDecision });
    expect(screen.getByText(/synthetic-revision/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Open source' })).toHaveAttribute(
      'href',
      item.url
    );
    const save = screen.getByRole('button', { name: 'Save Correction' });
    expect(save).toBeEnabled();
    fireEvent.click(save);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Enter a correction before saving.'
    );
    expect(onDecision).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Correct Display name')).toHaveValue('');
    fireEvent.change(screen.getByLabelText('Correct Display name'), {
      target: { value: 'Ada Artist' },
    });
    expect(onDecision).not.toHaveBeenCalled();
    fireEvent.click(save);
    expect(onDecision).toHaveBeenCalledWith(item, 'no', 'Ada Artist');
  });

  it('keeps unknown confidence and stale evidence explicit, and disables pending review', () => {
    const { rerender } = render(
      <OutboundRailFact
        item={{ ...item, confidence: null, freshness: 'unknown' }}
        active={false}
        pending
        onDecision={vi.fn()}
      />
    );
    expect(screen.getByText('Confidence unknown')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Yes' })).toBeDisabled();
    rerender(
      <OutboundRailFact
        item={{ ...item, freshness: 'stale' }}
        active={false}
        pending={false}
        onDecision={vi.fn()}
      />
    );
    expect(screen.getByText('Stale, recheck (was 80%)')).toBeVisible();
  });
});
