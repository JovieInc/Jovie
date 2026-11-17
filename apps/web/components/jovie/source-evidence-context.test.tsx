import { render, renderHook, screen, waitFor } from '@testing-library/react';
import { useContext } from 'react';
import { describe, expect, it } from 'vitest';
import type { EnrichedFact } from '@/lib/profile-facts/enrichment';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  sourceFixture,
  sourceMessageFixture,
} from './components/source-evidence.fixtures';
import {
  SourceEvidenceContext,
  SourceEvidenceProvider,
  useSourceFactsByMessage,
} from './source-evidence-context';

function FactList() {
  const facts = useContext(SourceEvidenceContext);
  return (
    <ul aria-label='Public facts'>
      {facts.map(fact => (
        <li key={fact.id}>{fact.predicate}</li>
      ))}
    </ul>
  );
}

function renderProvider(facts: readonly EnrichedFact[], dir?: 'rtl') {
  return render(
    <main dir={dir}>
      <SourceEvidenceProvider facts={facts}>
        <p>Assistant reply</p>
        <FactList />
      </SourceEvidenceProvider>
    </main>
  );
}

const evidenceState = (container: HTMLElement) =>
  container.querySelector('[data-source-evidence]');

describe('SourceEvidenceProvider', () => {
  it('is ready at once with no facts, and keeps its children', async () => {
    const { container } = renderProvider([]);
    expect(evidenceState(container)).toHaveAttribute(
      'data-source-evidence',
      'ready'
    );
    expect(evidenceState(container)).toHaveClass('contents');
    expect(screen.getByText('Assistant reply')).toBeInTheDocument();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    await expectNoA11yViolations(container);
  });

  it('is pending while the projection loads, then shares the public facts', async () => {
    const { container } = renderProvider([sourceFixture()]);
    expect(evidenceState(container)).toHaveAttribute(
      'data-source-evidence',
      'pending'
    );
    expect(screen.getByText('Assistant reply')).toBeInTheDocument();
    await expectNoA11yViolations(container);

    await waitFor(() =>
      expect(evidenceState(container)).toHaveAttribute(
        'data-source-evidence',
        'ready'
      )
    );
    expect(screen.getByRole('listitem')).toHaveTextContent('spotify.followers');
    await expectNoA11yViolations(container);
  });

  it('drops facts that are not public', async () => {
    const { container } = renderProvider([
      sourceFixture(),
      sourceFixture({
        id: 'private-fact',
        predicate: 'contact.email',
        permission: 'private',
      } as Partial<EnrichedFact>),
    ]);
    await waitFor(() =>
      expect(evidenceState(container)).toHaveAttribute(
        'data-source-evidence',
        'ready'
      )
    );
    expect(screen.getAllByRole('listitem').map(li => li.textContent)).toEqual([
      'spotify.followers',
    ]);
  });

  it('shares many facts and keeps them in order', async () => {
    const facts = Array.from({ length: 12 }, (_, index) =>
      sourceFixture({
        id: `fact-${index}`,
        predicate: `spotify.metric.${index}`,
      })
    );
    const { container } = renderProvider(facts);
    await waitFor(() =>
      expect(screen.getAllByRole('listitem')).toHaveLength(12)
    );
    expect(screen.getAllByRole('listitem')[11]).toHaveTextContent(
      'spotify.metric.11'
    );
    await expectNoA11yViolations(container);
  });

  it('clears the shared facts when the facts change to none', async () => {
    const { container, rerender } = renderProvider([sourceFixture()]);
    await waitFor(() =>
      expect(screen.getAllByRole('listitem')).toHaveLength(1)
    );
    rerender(
      <main>
        <SourceEvidenceProvider facts={[]}>
          <p>Assistant reply</p>
          <FactList />
        </SourceEvidenceProvider>
      </main>
    );
    await waitFor(() =>
      expect(screen.queryAllByRole('listitem')).toHaveLength(0)
    );
    expect(evidenceState(container)).toHaveAttribute(
      'data-source-evidence',
      'ready'
    );
  });

  it('renders inside a right-to-left thread without a wrapper box', async () => {
    const { container } = renderProvider([sourceFixture()], 'rtl');
    await waitFor(() =>
      expect(screen.getAllByRole('listitem')).toHaveLength(1)
    );
    expect(container.querySelector('main')).toHaveAttribute('dir', 'rtl');
    expect(evidenceState(container)).toHaveClass('contents');
    await expectNoA11yViolations(container);
  });
});

describe('useSourceFactsByMessage', () => {
  it('returns an empty map for no messages', () => {
    const { result } = renderHook(() => useSourceFactsByMessage([]));
    expect(result.current.size).toBe(0);
  });

  it('maps each message to the evidence its receipts carry', async () => {
    const messages = [sourceMessageFixture('m1', '9.9K followers')];
    const { result } = renderHook(() => useSourceFactsByMessage(messages));
    expect(result.current.size).toBe(0);
    await waitFor(() => expect(result.current.size).toBe(1));
    expect(result.current.get('m1')?.[0]?.predicate).toBe('spotify.followers');
  });

  it('ignores a result computed for an older message list', async () => {
    const first = [sourceMessageFixture('m1', 'first')];
    const { result, rerender } = renderHook(
      ({ messages }) => useSourceFactsByMessage(messages),
      { initialProps: { messages: first } }
    );
    await waitFor(() => expect(result.current.size).toBe(1));
    const second = [sourceMessageFixture('m2', 'second')];
    rerender({ messages: second });
    expect(result.current.has('m1')).toBe(false);
    await waitFor(() => expect(result.current.has('m2')).toBe(true));
  });
});
