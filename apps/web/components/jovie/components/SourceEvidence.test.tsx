import { TooltipProvider } from '@jovie/ui';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { EnrichedFact } from '@/lib/profile-facts/enrichment';
import { fastRender } from '@/tests/utils/fast-render';
import { AssistantMessageText } from './AssistantMessageText';
import { ChatMarkdown } from './ChatMarkdown';
import { ChatMessage } from './ChatMessage';
import { SourceEvidenceProvider } from './SourceEvidence';
import { SourceFactCard } from './SourceFactCard';
import { sourceFixture } from './source-evidence.fixtures';

function renderEvidence(
  facts: readonly EnrichedFact[],
  content = '9.9K followers (source: enrichment).'
) {
  return fastRender(
    <SourceEvidenceProvider facts={facts}>
      <AssistantMessageText content={content} />
    </SourceEvidenceProvider>
  );
}

describe('inline typed source evidence', () => {
  it('mounts receipt-backed sources through the canonical chat message', () => {
    const messageProps = { id: 'receipt', role: 'assistant' as const };
    fastRender(
      <TooltipProvider>
        <ChatMessage
          {...messageProps}
          parts={[{ type: 'text', text: '9.9K followers' }]}
          sourceFacts={[sourceFixture()]}
        />
      </TooltipProvider>
    );
    expect(screen.getByTestId('entity-chip-popover-trigger')).toHaveTextContent(
      '9.9K followers'
    );
  });
  it('keeps inline markdown fragments inline with inspectable evidence', () => {
    fastRender(
      <SourceEvidenceProvider facts={[sourceFixture()]}>
        <ChatMarkdown content='9.9K followers' inline />
      </SourceEvidenceProvider>
    );
    expect(
      screen.getByTestId('entity-chip-popover-trigger').closest('p')
    ).toBeNull();
  });
  it.each([
    ['book.title', 'Book'],
    ['publication.title', 'Publication'],
    ['product.name', 'Product'],
    ['project.name', 'Project'],
    ['person.name', 'Person'],
    ['track.title', 'Music'],
    ['release.title', 'Music'],
    ['event.title', 'Event'],
    ['credential.title', 'Credential'],
    ['website.url', 'Website'],
    ['social.account', 'Social Account'],
  ])('presents %s in the canonical card', (predicate, category) => {
    fastRender(
      <SourceFactCard
        fact={sourceFixture({
          predicate,
          unit: null,
          value: { type: 'text', value: 'Public title' },
        })}
      />
    );
    expect(screen.getByTestId('source-fact-card')).toHaveTextContent(category);
    expect(screen.getByTestId('source-fact-card')).toHaveTextContent(
      'Public title'
    );
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('keeps formatted values inspectable while rejecting a link label invented by the model', async () => {
    const user = userEvent.setup();
    renderEvidence(
      [sourceFixture()],
      '**9.9K followers** and [Invented identity](https://open.spotify.com/artist/fixture).'
    );
    expect(screen.getAllByTestId('entity-chip-popover-trigger')).toHaveLength(
      2
    );
    expect(screen.queryByText('Invented identity')).toBeNull();
    await user.click(screen.getAllByTestId('entity-chip-popover-trigger')[0]);
    expect(await screen.findByTestId('source-fact-card')).toHaveTextContent(
      '9.9K followers'
    );
  });

  it.each(['unknown', 'contradicted', 'inaccessible'] as const)(
    'does not present %s metrics as a claim',
    status => {
      renderEvidence([sourceFixture({ status })]);
      expect(screen.queryByTestId('entity-chip-popover-trigger')).toBeNull();
    }
  );

  it('inspects a metric on focus, preserves focus, and dismisses with Escape', async () => {
    const user = userEvent.setup();
    renderEvidence([sourceFixture()]);
    expect(screen.queryByText(/source: enrichment/)).toBeNull();
    await user.tab();
    const trigger = screen.getByTestId('entity-chip-popover-trigger');
    expect(trigger).toHaveFocus();
    expect(await screen.findByTestId('source-fact-card')).toHaveTextContent(
      'Direct source'
    );
    expect(screen.getByTestId('source-fact-card')).toHaveTextContent(
      'Collected'
    );
    const link = screen.getByRole('link', { name: 'Open Source' });
    expect(link).toHaveAttribute(
      'href',
      'https://open.spotify.com/artist/fixture'
    );
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    await user.keyboard('{Escape}');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveFocus();
  });

  it('labels indirect, stale and unknown evidence without implying verification', async () => {
    const user = userEvent.setup();
    const fact = sourceFixture();
    renderEvidence([
      sourceFixture({
        sourceRefs: [
          {
            ...fact.sourceRefs[0],
            kind: 'enrichment',
            provider: 'catalog',
            fetchedAt: '2020-01-01T00:00:00.000Z',
          },
        ],
      }),
    ]);
    await user.click(screen.getByTestId('entity-chip-popover-trigger'));
    expect(await screen.findByTestId('source-fact-card')).toHaveTextContent(
      'Indirect enrichment · catalog'
    );
    expect(screen.getByTestId('source-fact-card')).toHaveTextContent(
      'stale · unverified'
    );
  });

  it('does not create false sources from restricted, unavailable or ambiguous numbers', () => {
    renderEvidence([sourceFixture({ permission: 'private' })]);
    expect(screen.queryByTestId('entity-chip-popover-trigger')).toBeNull();
    expect(screen.queryByText('Fixture Artist')).toBeNull();
  });

  it('preserves plain prose, code, and links without typed evidence', () => {
    renderEvidence(
      [],
      '42 guesses, `9.9K followers`, and [ordinary website](https://example.com).'
    );
    expect(screen.queryByTestId('entity-chip-popover-trigger')).toBeNull();
    expect(
      screen.getByRole('link', { name: 'ordinary website' })
    ).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('recognizes exact compact and full Spotify counts without confusing other numbers', () => {
    renderEvidence(
      [sourceFixture()],
      '9.9K Spotify followers, 9,900 followers, and 9,900 Spotify followers. 19.9K followers stay plain.'
    );
    expect(screen.getAllByTestId('entity-chip-popover-trigger')).toHaveLength(
      3
    );
  });

  it('uses an unavailable fallback for unknown evidence and recovers on a new receipt', async () => {
    const user = userEvent.setup();
    const fact = sourceFixture();
    const content = '[Artist](https://open.spotify.com/artist/fixture)';
    const view = renderEvidence(
      [sourceFixture({ value: null, status: 'unknown' })],
      content
    );
    await user.click(screen.getByTestId('entity-chip-popover-trigger'));
    expect(await screen.findByTestId('source-fact-card')).toHaveTextContent(
      'Source unavailable'
    );
    view.rerender(
      <SourceEvidenceProvider facts={[fact]}>
        <AssistantMessageText content={content} />
      </SourceEvidenceProvider>
    );
    expect(await screen.findByTestId('source-fact-card')).toHaveTextContent(
      '9.9K followers'
    );
  });

  it('switches adjacent sources without leaving an orphaned card', async () => {
    const user = userEvent.setup();
    renderEvidence(
      [sourceFixture()],
      '[Artist](https://open.spotify.com/artist/fixture) has 9.9K followers.'
    );
    const triggers = screen.getAllByTestId('entity-chip-popover-trigger');
    await user.hover(triggers[0]);
    await screen.findByTestId('source-fact-card');
    await user.hover(triggers[1]);
    expect(await screen.findAllByTestId('source-fact-card')).toHaveLength(1);
  });
});
