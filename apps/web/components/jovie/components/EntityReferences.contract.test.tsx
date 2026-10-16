import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ReleaseViewModel } from '@/lib/discography/types';
import { queryKeys } from '@/lib/queries';
import { AssistantMessageText } from './AssistantMessageText';
import { EntityChipPopover } from './EntityChipPopover';
import { EntityResolutionProvider } from './EntityResolutionProvider';
import { TokenizedText } from './TokenizedText';

vi.mock('./ChatMarkdown', () => ({
  ChatMarkdown: ({ content }: { content: string }) => <span>{content}</span>,
}));

const key = queryKeys.releases.matrix('creator-a');
function release(title: string, profileId = 'creator-a'): ReleaseViewModel {
  return {
    id: 'work-a',
    profileId,
    title,
    status: 'draft',
    artworkUrl: null,
    artistNames: [],
    releaseType: 'single',
    providers: [],
    totalTracks: 1,
  } as unknown as ReleaseViewModel;
}

function surface(client: QueryClient, profileId = 'creator-a') {
  return (
    <QueryClientProvider client={client}>
      <EntityResolutionProvider profileId={profileId}>
        <textarea aria-label='Draft' defaultValue='Unsent request' />
        <input type='file' aria-label='Attachments' />
        <div data-testid='transcript' tabIndex={-1}>
          <TokenizedText content='Review @release:work-a[Private old title]' />
          <AssistantMessageText content='Use @release:work-a[Private old title]' />
        </div>
      </EntityResolutionProvider>
    </QueryClientProvider>
  );
}

describe('entity reference contract (JOV-8019 deliberate-red fixtures)', () => {
  it('uses the live identity on both transcript adapters and never the stored title', async () => {
    const client = new QueryClient();
    client.setQueryData(key, [release('Current title')]);
    render(surface(client));
    expect(screen.queryByText('Private old title')).toBeNull();
    expect(screen.getByTestId('entity-chip')).toHaveTextContent(
      'Current title'
    );
    expect(screen.getByTestId('entity-mention-span')).toHaveTextContent(
      'Current title'
    );
    const title = 'Renamed work '.repeat(30);
    await act(async () => {
      client.setQueryData(key, [release(title)]);
    });
    expect(screen.getByTestId('entity-chip')).toHaveTextContent(title.trim());
    expect(screen.getByTestId('entity-mention-span')).toHaveTextContent(
      title.trim()
    );
    expect(screen.queryByRole('img')).toBeNull();
  });

  it.each(['deleted', 'invalidated', 'denied', 'wrong-row'] as const)(
    'hides historical private metadata when the scoped read becomes %s',
    async failure => {
      const client = new QueryClient();
      client.setQueryData(key, [release('Current private title')]);
      render(surface(client));
      expect(screen.getByTestId('entity-chip')).toHaveTextContent(
        'Current private title'
      );
      await act(async () => {
        if (failure === 'invalidated')
          await client.invalidateQueries({ queryKey: key });
        else if (failure === 'denied')
          client
            .getQueryCache()
            .find({ queryKey: key })
            ?.setState({
              status: 'error',
              error: new Error('403'),
              errorUpdateCount: 1,
            });
        else
          client.setQueryData(
            key,
            failure === 'wrong-row'
              ? [release('Other account secret', 'creator-b')]
              : []
          );
      });
      expect(screen.queryByText('Current private title')).toBeNull();
      expect(screen.queryByText('Private old title')).toBeNull();
      expect(screen.queryByText('Other account secret')).toBeNull();
      expect(
        screen.getAllByRole('button', {
          name: 'Release: Unavailable reference',
        })
      ).toHaveLength(2);
      await userEvent.click(
        screen.getAllByTestId('entity-chip-popover-trigger')[0]
      );
      expect(
        await screen.findByRole('heading', { name: 'Unavailable reference' })
      ).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Open Release' })).toBeNull();
    }
  );

  it('drops the old account immediately and recovers only from the new scoped read', async () => {
    const client = new QueryClient();
    client.setQueryData(key, [release('Account A secret')]);
    const view = render(surface(client));
    view.rerender(surface(client, 'creator-b'));
    expect(screen.queryByText('Account A secret')).toBeNull();
    await act(async () => {
      client.setQueryData(queryKeys.releases.matrix('creator-b'), [
        release('Account B work', 'creator-b'),
      ]);
    });
    expect(screen.getByTestId('entity-chip')).toHaveTextContent(
      'Account B work'
    );
  });

  it('rejects metadata for another object even when a caller supplies it', async () => {
    render(
      <EntityChipPopover
        kind='release'
        id='work-a'
        label='Private title'
        entity={{
          kind: 'release',
          id: 'work-b',
          label: 'Other private title',
          thumbnail: 'https://example.test/private.jpg',
        }}
      >
        <span>Private title</span>
      </EntityChipPopover>
    );
    expect(screen.queryByText('Private title')).toBeNull();
    await userEvent.click(screen.getByTestId('entity-chip-popover-trigger'));
    expect(
      await screen.findByRole('heading', { name: 'Unavailable reference' })
    ).toBeInTheDocument();
    expect(screen.queryByText('Other private title')).toBeNull();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('opening and closing a preview preserves draft, attachments, scroll and trigger focus without a write', async () => {
    const client = new QueryClient();
    client.setQueryData(key, [release('Current title')]);
    render(surface(client));
    const draft = screen.getByLabelText('Draft') as HTMLTextAreaElement;
    draft.setSelectionRange(3, 8);
    const files = screen.getByLabelText('Attachments') as HTMLInputElement;
    const attachment = new File(['unsent'], 'notes.txt', {
      type: 'text/plain',
    });
    fireEvent.change(files, { target: { files: [attachment] } });
    const transcript = screen.getByTestId('transcript');
    transcript.scrollTop = 140;
    const trigger = screen.getAllByTestId('entity-chip-popover-trigger')[0];
    const user = userEvent.setup();
    await user.click(trigger);
    expect(
      await screen.findByRole('heading', { name: 'Current title' })
    ).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(screen.getByLabelText('Draft')).toBe(draft);
    expect(draft.value).toBe('Unsent request');
    expect([draft.selectionStart, draft.selectionEnd]).toEqual([3, 8]);
    expect(files.files?.[0]).toBe(attachment);
    expect(transcript.scrollTop).toBe(140);
    expect(client.getMutationCache().getAll()).toHaveLength(0);
  });
});
