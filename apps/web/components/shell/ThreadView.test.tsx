import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/jovie/components/ChatInput', () => ({
  ChatInput: ({ placeholder }: { placeholder?: string }) => (
    <input data-testid='mock-chat-input' placeholder={placeholder} />
  ),
}));

import { ThreadTurn } from './ThreadTurn';
import { ThreadView } from './ThreadView';
import type { ThreadViewData } from './thread.types';

const baseThread: ThreadViewData = {
  id: 'thr-1',
  title: 'Generating lyric video',
  status: 'running',
};

describe('ThreadView', () => {
  it('renders the thread title in the header', () => {
    render(
      <ThreadView thread={baseThread}>
        <ThreadTurn speaker='jovie'>hi</ThreadTurn>
      </ThreadView>
    );
    expect(
      screen.getByRole('heading', { name: /Generating lyric video/ })
    ).toBeInTheDocument();
  });

  it('renders the entity link line when both entityKind + entityId are set', () => {
    render(
      <ThreadView
        thread={{ ...baseThread, entityKind: 'release', entityId: 'rel-1' }}
      >
        <ThreadTurn speaker='jovie'>hi</ThreadTurn>
      </ThreadView>
    );
    expect(screen.getByText(/Linked to release/)).toBeInTheDocument();
    expect(screen.getByText('rel-1')).toBeInTheDocument();
  });

  it('forwards turns through the children slot', () => {
    render(
      <ThreadView thread={baseThread}>
        <ThreadTurn speaker='me'>my reply</ThreadTurn>
      </ThreadView>
    );
    expect(screen.getByText('my reply')).toBeInTheDocument();
  });

  it('mounts a default composer with the provided placeholder', () => {
    render(
      <ThreadView thread={baseThread} composerPlaceholder='Reply…'>
        <ThreadTurn speaker='jovie'>hi</ThreadTurn>
      </ThreadView>
    );
    expect(screen.getByPlaceholderText('Reply…')).toBeInTheDocument();
  });

  it('mounts a custom composer when provided', () => {
    render(
      <ThreadView
        thread={baseThread}
        composer={<button type='button'>my-composer</button>}
      >
        <ThreadTurn speaker='jovie'>hi</ThreadTurn>
      </ThreadView>
    );
    expect(
      screen.getByRole('button', { name: 'my-composer' })
    ).toBeInTheDocument();
    expect(screen.queryByTestId('mock-chat-input')).toBeNull();
  });
});

describe('ThreadView shell contract', () => {
  it('uses shared shell spacing tokens for the scroll column and composer dock', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'components/shell/ThreadView.tsx'),
      'utf8'
    );

    expect(source).toContain('px-(--linear-app-header-padding-x)');
    expect(source).toContain('max-w-[44rem]');
    expect(source).toContain('env(safe-area-inset-bottom)');
    expect(source).toContain('shadow-popover');
    expect(source).not.toContain('max-w-3xl');
    expect(source).not.toContain('px-8');
    expect(source).not.toContain('focus-visible:ring-primary-token');
    expect(source).not.toContain('transition-all');
  });
});
