import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  type SidebarThread,
  SidebarThreadsSection,
} from './SidebarThreadsSection';

vi.mock('next/link', () => ({
  default: React.forwardRef<
    HTMLAnchorElement,
    React.ComponentPropsWithoutRef<'a'> & { readonly prefetch?: boolean }
  >(function TestLink({ prefetch: _prefetch, ...props }, ref) {
    return <a {...props} ref={ref} />;
  }),
}));

const threads: SidebarThread[] = [
  {
    id: 'running',
    title: 'Pitch tasks',
    status: 'running',
    updatedAt: '2026-05-12T00:00:00.000Z',
  },
  {
    id: 'errored',
    title: 'Release rollout',
    status: 'errored',
    updatedAt: '2026-05-11T00:00:00.000Z',
  },
  {
    id: 'unread',
    title: 'Tour poster copy',
    status: 'complete',
    unread: true,
    updatedAt: '2026-05-10T00:00:00.000Z',
  },
  {
    id: 'read',
    title: 'Budget notes',
    status: 'complete',
    updatedAt: '2026-05-09T00:00:00.000Z',
  },
];

function dotFor(title: string): HTMLElement {
  const row = screen.getByRole('button', { name: new RegExp(title) });
  return row.querySelector('span.rounded-full') as HTMLElement;
}

describe('SidebarThreadsSection certificate', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-05-12T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it('paints status dots with semantic tokens and selects a thread', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const { container } = render(
      <SidebarThreadsSection
        threads={threads}
        activeThreadId={null}
        onSelect={onSelect}
        collapsed={false}
      />
    );
    expect(dotFor('Pitch tasks')).toHaveClass(
      'bg-accent/85',
      'anim-calm-breath'
    );
    expect(dotFor('Release rollout')).toHaveClass('bg-error/85');
    expect(dotFor('Tour poster copy')).toHaveClass('bg-accent/85');
    expect(dotFor('Budget notes')).toHaveClass('bg-primary-token/25');
    expect(container.innerHTML).not.toMatch(/(cyan|rose)-\d|bg-white/);

    await user.click(screen.getByRole('button', { name: /Release rollout/ }));
    expect(onSelect).toHaveBeenCalledWith('errored');
    await expectNoA11yViolations(container);
  });

  it('shows the loading row before the first page arrives', async () => {
    const { container } = render(
      <SidebarThreadsSection
        threads={[]}
        activeThreadId={null}
        state='loading'
        onNewThread={vi.fn()}
        collapsed={false}
      />
    );
    expect(container.querySelectorAll('.skeleton')).toHaveLength(2);
    await expectNoA11yViolations(container);
  });

  it('starts a new chat from the empty history', async () => {
    const user = userEvent.setup();
    const onNewThread = vi.fn();
    const { container } = render(
      <SidebarThreadsSection
        threads={[]}
        activeThreadId={null}
        calm
        onNewThread={onNewThread}
        collapsed={false}
      />
    );
    expect(screen.getByText('Today')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'New Chat' }));
    expect(onNewThread).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('retries after an error with no chats loaded', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const { container } = render(
      <SidebarThreadsSection
        threads={[]}
        activeThreadId={null}
        state='error'
        onRetry={onRetry}
        collapsed={false}
      />
    );
    expect(screen.getByText('Conversations unavailable')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry Chats' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('keeps loaded chats listed when a refresh fails', async () => {
    const { container } = render(
      <SidebarThreadsSection
        threads={threads}
        activeThreadId='running'
        state='error'
        onRetry={vi.fn()}
        collapsed={false}
      />
    );
    expect(screen.queryByText('Conversations unavailable')).toBeNull();
    expect(screen.getByRole('button', { name: /Pitch tasks/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await expectNoA11yViolations(container);
  });

  it('opens row actions for a long title and renders right to left', async () => {
    const user = userEvent.setup();
    const onThreadContextMenu = vi.fn();
    const longTitle =
      'Plan the full autumn release campaign with audience insights and touring updates';
    const { container } = render(
      <div dir='rtl'>
        <SidebarThreadsSection
          threads={[{ ...threads[0], title: longTitle }]}
          activeThreadId={null}
          onThreadContextMenu={onThreadContextMenu}
          collapsed={false}
        />
      </div>
    );
    expect(screen.getByText(longTitle)).toHaveClass('text-ellipsis');
    await user.click(
      screen.getByRole('button', { name: `Chat Actions for ${longTitle}` })
    );
    expect(onThreadContextMenu).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });
});

describe('SidebarThreadsSection trailing date', () => {
  it('steps the date aside while the chat actions button shows', () => {
    const { container } = render(
      <SidebarThreadsSection
        threads={threads}
        activeThreadId={null}
        calm
        onThreadContextMenu={vi.fn()}
        collapsed={false}
      />
    );
    const date = container.querySelector('time');
    expect(date).toHaveClass('group-hover/thread:opacity-0');
    expect(date).toHaveClass('group-focus-within/thread:opacity-0');
  });

  it('keeps the date steady when the row has no actions', () => {
    const { container } = render(
      <SidebarThreadsSection
        threads={threads}
        activeThreadId={null}
        calm
        collapsed={false}
      />
    );
    expect(container.querySelector('time')).not.toHaveClass(
      'group-hover/thread:opacity-0'
    );
  });
});

describe('SidebarThreadsSection status dot tokens', () => {
  it('paints running, errored and read dots with semantic tokens', () => {
    const { container } = render(
      <SidebarThreadsSection
        threads={[
          { ...threads[0], id: 'a', title: 'Running', status: 'running' },
          { ...threads[1], id: 'b', title: 'Errored', status: 'errored' },
        ]}
        activeThreadId={null}
        collapsed={false}
      />
    );
    expect(container.querySelector('.bg-accent\\/85')).toBeInTheDocument();
    expect(container.querySelector('.bg-error\\/85')).toBeInTheDocument();
    expect(container.innerHTML).not.toMatch(/(cyan|rose)-\d|bg-white\//);
  });
});
