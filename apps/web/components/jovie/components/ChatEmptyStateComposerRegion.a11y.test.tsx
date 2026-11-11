import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  CHAT_EMPTY_ROTATE_SAMPLES,
  CHAT_EMPTY_SAMPLE_STORAGE_KEY,
} from '../chat-empty-starters';
import { ChatEmptyStateComposerRegion } from './ChatEmptyStateComposerRegion';

// Companion to ChatEmptyStateComposerRegion.test.tsx (kept separate so each
// file stays under the repo's 500-line cap): an axe audit of every layout the
// region renders, with a labelled composer stand-in as its child.
function Composer() {
  return <textarea aria-label='Message Jovie' rows={2} />;
}

describe('ChatEmptyStateComposerRegion accessibility', () => {
  beforeEach(() => {
    sessionStorage.removeItem(CHAT_EMPTY_SAMPLE_STORAGE_KEY);
  });

  it('centered welcome with an executable sample', async () => {
    const onSelectSample = vi.fn();
    const { container } = render(
      <ChatEmptyStateComposerRegion onSelectSample={onSelectSample}>
        <Composer />
      </ChatEmptyStateComposerRegion>
    );

    expect(
      screen.getByTestId('chat-empty-state-composer-region')
    ).toHaveAttribute('data-layout', 'centered');
    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('chat-empty-state-sample-button'));
    expect(onSelectSample).toHaveBeenCalledWith(
      CHAT_EMPTY_ROTATE_SAMPLES[0].prompt
    );
    await expectNoA11yViolations(container);
  });

  it('centered welcome with a read-only sample', async () => {
    const { container } = render(
      <ChatEmptyStateComposerRegion>
        <Composer />
      </ChatEmptyStateComposerRegion>
    );

    expect(
      screen.queryByTestId('chat-empty-state-sample-button')
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('chat-empty-state-sample')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('docked welcome', async () => {
    const { container } = render(
      <ChatEmptyStateComposerRegion
        stableDocked
        showDockedWelcome
        onSelectSample={vi.fn()}
      >
        <Composer />
      </ChatEmptyStateComposerRegion>
    );

    expect(
      screen.getByTestId('chat-empty-state-composer-region')
    ).toHaveAttribute('data-layout', 'docked');
    expect(screen.getByTestId('chat-empty-state-welcome')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('empty docked region keeps only the composer', async () => {
    const { container } = render(
      <ChatEmptyStateComposerRegion stableDocked>
        <Composer />
      </ChatEmptyStateComposerRegion>
    );

    expect(
      screen.queryByTestId('chat-empty-state-welcome')
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('textbox', { name: 'Message Jovie' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('suggestions above a docked composer', async () => {
    const { container } = render(
      <ChatEmptyStateComposerRegion
        above={
          <ul aria-label='Suggestions'>
            <li>
              <button type='button'>Review your release checklist</button>
            </li>
          </ul>
        }
      >
        <Composer />
      </ChatEmptyStateComposerRegion>
    );

    expect(
      screen.getByRole('list', { name: 'Suggestions' })
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('chat-empty-state-welcome')
    ).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('right to left', async () => {
    const { container } = render(
      <div dir='rtl'>
        <ChatEmptyStateComposerRegion onSelectSample={vi.fn()}>
          <Composer />
        </ChatEmptyStateComposerRegion>
      </div>
    );

    expect(
      screen.getByTestId('chat-empty-state-sample-button')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
