import { TooltipProvider } from '@jovie/ui';
import type { Virtualizer } from '@tanstack/react-virtual';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TOOL_STATUS_PARTS } from '@/components/jovie/fixtures/tool-status';
import type { EnrichedFact } from '@/lib/profile-facts/enrichment';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { fastRender } from '@/tests/utils/fast-render';
import { ChatThreadMessages } from '../JovieChatSections';
import { SourceEvidenceProvider } from '../source-evidence-context';
import { AssistantMessageText } from './AssistantMessageText';
import { ChatMarkdown } from './ChatMarkdown';
import { ChatMessage } from './ChatMessage';
import { SourceFactCard } from './SourceFactCard';
import {
  sourceFixture,
  sourceMessageFixture,
} from './source-evidence.fixtures';

const SOURCE_CHIP = 'entity-chip-popover-trigger';
const findSourceChip = () => screen.findByTestId(SOURCE_CHIP);
const SOURCE_CARD = 'source-fact-card';
const sourceCard = () => screen.getByTestId(SOURCE_CARD);
const findSourceCard = () => screen.findByTestId(SOURCE_CARD);

async function settleSourceEvidence() {
  await waitFor(() => {
    expect(
      document.querySelector('[data-source-markdown="ready"]')
    ).toBeTruthy();
    expect(
      document.querySelector('[data-source-evidence="ready"]')
    ).toBeTruthy();
  });
}

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
  it('mounts receipt-backed sources through the canonical chat message', async () => {
    fastRender(
      <TooltipProvider>
        <ChatMessage
          {...sourceMessageFixture('receipt', '9.9K followers')}
          sourceFacts={[sourceFixture()]}
        />
      </TooltipProvider>
    );
    expect(await findSourceChip()).toHaveTextContent('9.9K followers');
  });

  it.each(['succeeded', 'failed'] as const)(
    'keeps one feedback row beside source evidence for a %s tool',
    async state => {
      fastRender(
        <TooltipProvider>
          <ChatMessage
            {...sourceMessageFixture('tool-with-source', '9.9K followers')}
            parts={[
              { type: 'text', text: '9.9K followers' },
              ...TOOL_STATUS_PARTS[state],
            ]}
            sourceFacts={[sourceFixture()]}
            enableFeedback
          />
        </TooltipProvider>
      );

      expect(await findSourceChip()).toHaveTextContent('9.9K followers');
      const feedback = screen.getAllByTestId('chat-feedback-control');
      expect(feedback).toHaveLength(1);
      expect(feedback[0]).toHaveAttribute(
        'data-tool-call-id',
        'press-source:attempt-1'
      );
      expect(
        screen.getAllByRole('button', { name: 'Good response' })
      ).toHaveLength(1);
    }
  );

  it('retains message feedback when a separate surface renders the tool', () => {
    fastRender(
      <TooltipProvider>
        <ChatMessage
          {...sourceMessageFixture('separate-tool-surface', 'Source saved.')}
          parts={[
            { type: 'text', text: 'Source saved.' },
            ...TOOL_STATUS_PARTS.succeeded,
          ]}
          renderTools={false}
          enableFeedback
        />
      </TooltipProvider>
    );

    const feedback = screen.getAllByTestId('chat-feedback-control');
    expect(feedback).toHaveLength(1);
    expect(feedback[0]).not.toHaveAttribute('data-tool-call-id');
  });

  it('retains message feedback for a text-only reply', () => {
    fastRender(
      <TooltipProvider>
        <ChatMessage
          {...sourceMessageFixture(
            'text-only',
            'Tell me about your next release.'
          )}
          parts={[{ type: 'text', text: 'Tell me about your next release.' }]}
          enableFeedback
        />
      </TooltipProvider>
    );

    const feedback = screen.getAllByTestId('chat-feedback-control');
    expect(feedback).toHaveLength(1);
    expect(feedback[0]).not.toHaveAttribute('data-tool-call-id');
  });
  it('keeps inline markdown fragments inline with inspectable evidence', async () => {
    fastRender(
      <SourceEvidenceProvider facts={[sourceFixture()]}>
        <ChatMarkdown content='9.9K followers' inline />
      </SourceEvidenceProvider>
    );
    expect((await findSourceChip()).closest('p')).toBeNull();
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
    const fact = sourceFixture({
      predicate,
      unit: null,
      value: { type: 'text', value: 'Public title' },
    });
    fastRender(<SourceFactCard fact={fact} />);
    expect(sourceCard()).toHaveTextContent(category);
    expect(sourceCard()).toHaveTextContent('Public title');
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('keeps formatted values inspectable while rejecting a link label invented by the model', async () => {
    const user = userEvent.setup();
    renderEvidence(
      [sourceFixture()],
      '**9.9K followers** and [Invented identity](https://open.spotify.com/artist/fixture).'
    );
    await waitFor(() => {
      expect(screen.getAllByTestId(SOURCE_CHIP)).toHaveLength(2);
    });
    expect(screen.queryByText('Invented identity')).toBeNull();
    await user.click(screen.getAllByTestId(SOURCE_CHIP)[0]);
    expect(await findSourceCard()).toHaveTextContent('9.9K followers');
  });

  it.each(['unknown', 'contradicted', 'inaccessible'] as const)(
    'does not present %s metrics as a claim',
    async status => {
      renderEvidence([sourceFixture({ status })]);
      await settleSourceEvidence();
      expect(screen.queryByTestId(SOURCE_CHIP)).toBeNull();
    }
  );

  it('inspects a metric on focus, preserves focus, and dismisses with Escape', async () => {
    const user = userEvent.setup();
    renderEvidence([sourceFixture()]);
    await settleSourceEvidence();
    expect(screen.queryByText(/source: enrichment/)).toBeNull();
    await user.tab();
    const trigger = screen.getByTestId(SOURCE_CHIP);
    expect(trigger).toHaveFocus();
    expect(await findSourceCard()).toHaveTextContent('Direct source');
    expect(sourceCard()).toHaveTextContent('Collected');
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
    await user.click(await findSourceChip());
    expect(await findSourceCard()).toHaveTextContent(
      'Indirect enrichment · catalog'
    );
    expect(sourceCard()).toHaveTextContent('stale · unverified');
  });

  it('does not create false sources from restricted, unavailable or ambiguous numbers', async () => {
    renderEvidence([sourceFixture({ permission: 'private' })]);
    await settleSourceEvidence();
    expect(screen.queryByTestId(SOURCE_CHIP)).toBeNull();
    expect(screen.queryByText('Fixture Artist')).toBeNull();
  });

  it('preserves plain prose, code, and links without typed evidence', async () => {
    renderEvidence(
      [],
      '42 guesses, `9.9K followers`, and [ordinary website](https://example.com).'
    );
    await settleSourceEvidence();
    expect(screen.queryByTestId(SOURCE_CHIP)).toBeNull();
    expect(
      screen.getByRole('link', { name: 'ordinary website' })
    ).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('recognizes exact compact and full Spotify counts without confusing other numbers', async () => {
    renderEvidence(
      [sourceFixture()],
      '9.9K Spotify followers, 9,900 followers, and 9,900 Spotify followers. 19.9K followers stay plain.'
    );
    await waitFor(() => {
      expect(screen.getAllByTestId(SOURCE_CHIP)).toHaveLength(3);
    });
  });

  it('keeps the source actionable without inventing unknown values and recovers on a new receipt', async () => {
    const user = userEvent.setup();
    const fact = sourceFixture();
    const content = '[9.9K followers](https://open.spotify.com/artist/fixture)';
    const view = renderEvidence(
      [sourceFixture({ value: null, status: 'unknown' })],
      content
    );
    const trigger = await findSourceChip();
    expect(trigger).not.toHaveTextContent('9.9K followers');
    await user.click(trigger);
    expect(await findSourceCard()).not.toHaveTextContent('9.9K followers');
    expect(screen.getByRole('link', { name: 'Open Source' })).toHaveAttribute(
      'href',
      'https://open.spotify.com/artist/fixture'
    );
    view.rerender(
      <SourceEvidenceProvider facts={[fact]}>
        <AssistantMessageText content={content} />
      </SourceEvidenceProvider>
    );
    await waitFor(() => {
      expect(sourceCard()).toHaveTextContent('9.9K followers');
    });
  });

  it('switches adjacent sources without leaving an orphaned card', async () => {
    const user = userEvent.setup();
    renderEvidence(
      [sourceFixture()],
      '[Artist](https://open.spotify.com/artist/fixture) has 9.9K followers.'
    );
    await waitFor(() => {
      expect(screen.getAllByTestId(SOURCE_CHIP)).toHaveLength(2);
    });
    const triggers = screen.getAllByTestId(SOURCE_CHIP);
    await user.hover(triggers[0]);
    await findSourceCard();
    await user.hover(triggers[1]);
    expect(await screen.findAllByTestId(SOURCE_CARD)).toHaveLength(1);
  });

  it('opens a narrow viewport in the bottom sheet', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('max-width'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    try {
      const user = userEvent.setup();
      renderEvidence([sourceFixture()]);
      await user.click(await findSourceChip());
      const sheet = await screen.findByTestId('entity-chip-source-sheet');
      expect(sheet).toHaveAttribute('data-side', 'bottom');
      expect(sheet).toHaveTextContent('Direct source');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

it('renders text-only evidence without an invented image or artwork placeholder', () => {
  const { container } = fastRender(<SourceFactCard fact={sourceFixture()} />);
  expect(screen.getByRole('heading', { name: 'Fixture Artist' })).toBeVisible();
  expect(screen.getByRole('link', { name: 'Open Source' })).toHaveAttribute(
    'rel',
    'noopener noreferrer'
  );
  expect(container.querySelector('img, .aspect-square')).toBeNull();
});

it('forwards public tool evidence through the app transcript', async () => {
  fastRender(
    <TooltipProvider>
      <ChatThreadMessages
        messages={[sourceMessageFixture('sourced', '9.9K followers')]}
        shouldVirtualizeMessages={false}
        virtualizer={{} as Virtualizer<HTMLDivElement, Element>}
        virtualizedMessageViewportHeight={0}
        virtualizedMinHeight={0}
        messageViewportPaddingBottom={undefined}
        totalSizeRef={() => undefined}
        bottomSentinelRef={() => undefined}
        isStreaming={false}
        lastAssistantIndex={-1}
        knownMessageIds={new Set()}
        inlineChatError={null}
        isStuckToBottom
        onScrollToBottom={() => undefined}
      />
    </TooltipProvider>
  );
  expect(await findSourceChip()).toHaveTextContent('9.9K followers');
});

describe('source evidence certificate states', () => {
  const longReply = [
    'Your Spotify audience grew to 9.9K followers this quarter, which puts the Extended Midnight Drive Sessions campaign ahead of plan.',
    '',
    '- 9,900 followers is the figure Spotify reported on the latest fetch.',
    '- Keep pitching the deluxe edition to editorial playlists through release week.',
  ].join('\n');

  async function renderMarkdown(
    facts: readonly EnrichedFact[],
    content: string,
    dir?: 'rtl'
  ) {
    const view = fastRender(
      <div dir={dir} lang={dir ? 'ar' : undefined}>
        <SourceEvidenceProvider facts={facts}>
          <ChatMarkdown content={content} />
        </SourceEvidenceProvider>
      </div>
    );
    await settleSourceEvidence();
    return view;
  }

  it('leaves numbers as plain prose with no facts and stays axe-clean', async () => {
    const { container } = await renderMarkdown(
      [],
      'You have 9.9K followers on Spotify.'
    );
    expect(screen.queryByTestId(SOURCE_CHIP)).toBeNull();
    expect(screen.getByText(/9\.9K followers/)).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('marks only the backed count when evidence is partial and stays axe-clean', async () => {
    const { container } = await renderMarkdown(
      [sourceFixture()],
      '9.9K Spotify followers so far, and 19.9K followers is the next milestone.'
    );
    await waitFor(() =>
      expect(screen.getAllByTestId(SOURCE_CHIP)).toHaveLength(1)
    );
    expect(
      screen.getByText(/19\.9K followers is the next milestone/)
    ).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('marks every backed count across a long reply and stays axe-clean', async () => {
    const { container } = await renderMarkdown([sourceFixture()], longReply);
    await waitFor(() =>
      expect(screen.getAllByTestId(SOURCE_CHIP)).toHaveLength(2)
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    await expectNoA11yViolations(container);
  });

  it('keeps an inspectable source inside right-to-left prose and stays axe-clean', async () => {
    const { container } = await renderMarkdown(
      [sourceFixture()],
      'لديك الآن 9.9K followers على سبوتيفاي.',
      'rtl'
    );
    expect(await findSourceChip()).toHaveTextContent('9.9K followers');
    await expectNoA11yViolations(container);
  });
});
