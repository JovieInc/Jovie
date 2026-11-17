import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { fastRender } from '@/tests/utils/fast-render';
import { AssistantMessageText } from './AssistantMessageText';
import { EntityResolutionProvider } from './EntityResolutionProvider';

vi.mock('./ChatMarkdown', () => ({
  ChatMarkdown: ({
    content,
    inline = false,
  }: {
    readonly content: string;
    readonly inline?: boolean;
  }) =>
    inline ? (
      <span data-testid='chat-markdown'>{content}</span>
    ) : (
      <div data-testid='chat-markdown'>{content}</div>
    ),
}));

describe('AssistantMessageText', () => {
  it('shows the text immediately and hands it to the lazy ChatMarkdown chunk', async () => {
    fastRender(
      <AssistantMessageText content='Here is a plain assistant reply. (source: enrichment)' />
    );

    // Before the markdown chunk resolves the words are already on screen.
    expect(screen.getByText('Here is a plain assistant reply.')).toBeTruthy();
    expect(await screen.findByTestId('chat-markdown')).toHaveTextContent(
      'Here is a plain assistant reply.'
    );
    expect(screen.queryByTestId('entity-mention-span')).toBeNull();
    expect(screen.getByTestId('chat-markdown')).not.toHaveTextContent(
      'source: enrichment'
    );
  });

  it('renders entity wire tokens as subdued mention spans with hover cards', async () => {
    const user = userEvent.setup();
    fastRender(
      <AssistantMessageText content='Listen to @release:rel_1[Sober] tonight.' />
    );

    const span = screen.getByTestId('entity-chip-popover-trigger');
    expect(span).toHaveTextContent('Unavailable reference');
    expect(span).toHaveClass('system-b-entity-chip-trigger');
    const markdownSegments = screen.getAllByTestId('chat-markdown');
    expect(markdownSegments[0]).toHaveTextContent('Listen to');
    expect(markdownSegments[1]).toHaveTextContent('tonight.');
    expect(markdownSegments).toHaveLength(2);
    expect(markdownSegments.every(segment => segment.tagName === 'SPAN')).toBe(
      true
    );
    expect(screen.queryByText('@release:rel_1[Sober]')).toBeNull();

    await user.click(screen.getByTestId('entity-chip-popover-trigger'));
    const content = await screen.findByTestId('entity-chip-popover-content');
    expect(content).toHaveAttribute('data-entity-kind', 'release');
    expect(content.textContent).toContain('Unavailable reference');
  });

  it('renders an own-profile mention with the creator name and a You card', async () => {
    const user = userEvent.setup();
    fastRender(
      <EntityResolutionProvider profileId='p1' ownProfileLabel='Tim White'>
        <AssistantMessageText content='Your page @profile:p1[Stale Name] is live.' />
      </EntityResolutionProvider>
    );

    const trigger = screen.getByTestId('entity-chip-popover-trigger');
    expect(trigger).toHaveTextContent('Profile: Tim White');
    expect(screen.queryByText(/Stale Name/)).toBeNull();
    expect(screen.queryByText(/@profile:/)).toBeNull();

    await user.click(trigger);
    const content = await screen.findByTestId('entity-chip-popover-content');
    expect(content).toHaveAttribute('data-entity-kind', 'profile');
    expect(content.textContent).toContain('Artist · You');
  });

  it("shows another creator's profile id as unavailable", () => {
    fastRender(
      <EntityResolutionProvider profileId='p1' ownProfileLabel='Tim White'>
        <AssistantMessageText content='See @profile:p2[Someone Else] too.' />
      </EntityResolutionProvider>
    );

    expect(screen.getByTestId('entity-chip-popover-trigger')).toHaveTextContent(
      'Unavailable reference'
    );
    expect(screen.queryByText(/Someone Else/)).toBeNull();
  });

  it('keeps structured markdown on the normal block renderer', () => {
    fastRender(
      <AssistantMessageText
        content={'- @release:rel_1[Sober]\n  keeps list semantics'}
      />
    );

    expect(
      screen
        .getAllByTestId('chat-markdown')
        .every(segment => segment.tagName === 'DIV')
    ).toBe(true);
  });

  it('renders skill tokens as neutral assistant mentions', () => {
    fastRender(
      <AssistantMessageText content='Try /skill:generateAlbumArt next.' />
    );

    expect(screen.getByTestId('assistant-skill-mention')).toHaveTextContent(
      'Generate album art'
    );
    expect(screen.queryByText('/skill:generateAlbumArt')).toBeNull();
  });
});

describe('AssistantMessageText certificate states', () => {
  const longReply = [
    '## Launch plan for The Extended Midnight Drive Sessions (Deluxe Anniversary Edition)',
    '',
    '1. Upload the final masters and confirm the ISRC codes match the distributor sheet.',
    '2. Point https://open.spotify.com/artist/0abcdefghijklmnopqrstuvwxyz1234567890 at the new smart link.',
    '',
    'Try /skill:generateAlbumArt for alternate artwork.',
  ].join('\n');

  it('has no axe violations for an empty first frame', async () => {
    const { container } = fastRender(
      <AssistantMessageText content='' isStreaming />
    );
    await expectNoA11yViolations(container);
  });

  it.each([
    [
      'streaming partial reply',
      'I found @release:rel_pending[Midnight Drive] and the next st',
      true,
    ],
    ['long structured reply', longReply, false],
    [
      'unresolved reference',
      'Review @release:missing[Private title] first.',
      false,
    ],
  ] as const)(
    'has no axe violations: %s',
    async (_state, content, isStreaming) => {
      const { container } = fastRender(
        <AssistantMessageText content={content} isStreaming={isStreaming} />
      );
      await screen.findAllByTestId('chat-markdown');
      await expectNoA11yViolations(container);
    }
  );

  it('draws nothing for an empty first frame', () => {
    const { container } = fastRender(
      <AssistantMessageText content='' isStreaming />
    );
    expect(container).toHaveTextContent('');
    expect(screen.queryByTestId('chat-markdown')).toBeNull();
    expect(screen.queryByTestId('entity-chip-popover-trigger')).toBeNull();
  });

  it('keeps a half-streamed sentence and an unresolved reference without leaking wire syntax', async () => {
    fastRender(
      <AssistantMessageText
        content='I found @release:rel_pending[Midnight Drive] and the next st'
        isStreaming
      />
    );
    expect(await screen.findByText('and the next st')).toBeInTheDocument();
    expect(screen.getByTestId('entity-chip-popover-trigger')).toHaveTextContent(
      'Unavailable reference'
    );
    expect(screen.queryByText(/@release:/)).toBeNull();
  });

  it('keeps a long reply whole, including its skill mention', async () => {
    fastRender(<AssistantMessageText content={longReply} />);
    const segments = await screen.findAllByTestId('chat-markdown');
    expect(segments[0]).toHaveTextContent(
      'Launch plan for The Extended Midnight Drive Sessions'
    );
    expect(screen.getByTestId('assistant-skill-mention')).toHaveTextContent(
      'Generate album art'
    );
  });

  it('renders a right-to-left reply with its entity mention and stays axe-clean', async () => {
    const { container } = fastRender(
      <div dir='rtl' lang='ar'>
        <AssistantMessageText content='استمع إلى @release:rel_1[ليلة في القاهرة] الليلة.' />
      </div>
    );
    const segments = await screen.findAllByTestId('chat-markdown');
    expect(segments[0]).toHaveTextContent('استمع إلى');
    expect(
      screen.getByTestId('entity-chip-popover-trigger')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
