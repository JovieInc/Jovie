import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ChatArtifactErrorCard } from './ChatArtifactErrorCard';

const prompts = vi.fn();
const onPrompt = (event: Event) =>
  prompts((event as CustomEvent<{ prompt: string }>).detail.prompt);

describe('ChatArtifactErrorCard', () => {
  afterEach(() => {
    globalThis.removeEventListener('jovie-chat-submit-prompt', onPrompt);
    prompts.mockReset();
  });

  it('shows the failure and resubmits the retry prompt', async () => {
    globalThis.addEventListener('jovie-chat-submit-prompt', onPrompt);
    const user = userEvent.setup();
    const { container } = render(
      <ChatArtifactErrorCard
        title='Album Art Failed'
        message='Jovie could not finish this action.'
        retryPrompt='Please retry album art.'
      />
    );

    const card = screen.getByTestId('chat-artifact-error-card');
    expect(card.tagName).toBe('OUTPUT');
    expect(card).toHaveTextContent('Album Art Failed');
    expect(card).toHaveTextContent('Jovie could not finish this action.');

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(prompts).toHaveBeenCalledWith('Please retry album art.');
    await expectNoA11yViolations(container);
  });

  it('falls back to the generic retry prompt', async () => {
    globalThis.addEventListener('jovie-chat-submit-prompt', onPrompt);
    const user = userEvent.setup();
    render(<ChatArtifactErrorCard title="Couldn't generate cover art" />);

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(prompts).toHaveBeenCalledWith('Please try again.');
  });

  it('renders the title alone when there is no message or retry', async () => {
    const { container } = render(
      <ChatArtifactErrorCard title='Presence task failed' showRetry={false} />
    );

    expect(screen.getByText('Presence task failed')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(container.querySelector('p')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('keeps long and right-to-left failures readable', async () => {
    const message =
      'The service behind this action is temporarily unavailable while we refresh your catalogue. '.repeat(
        3
      );
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ChatArtifactErrorCard
          title='تعذر إنشاء صورة الغلاف'
          message={message}
        />
      </div>
    );

    expect(screen.getByText('تعذر إنشاء صورة الغلاف')).toBeInTheDocument();
    expect(screen.getByText(message.trim())).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
