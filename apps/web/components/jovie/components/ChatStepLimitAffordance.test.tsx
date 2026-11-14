import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHAT_TOOL_STEP_LIMIT_AFFORDANCE_MESSAGE } from '@/lib/chat/tool-step-limit';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ChatStepLimitAffordance } from './ChatStepLimitAffordance';

const prompts = vi.fn();
const onPrompt = (event: Event) =>
  prompts((event as CustomEvent<{ prompt: string }>).detail.prompt);

describe('ChatStepLimitAffordance', () => {
  afterEach(() => {
    globalThis.removeEventListener('jovie-chat-submit-prompt', onPrompt);
    prompts.mockReset();
  });

  it('announces the step cap and resubmits continue on click and Enter', async () => {
    globalThis.addEventListener('jovie-chat-submit-prompt', onPrompt);
    const user = userEvent.setup();
    const { container } = render(<ChatStepLimitAffordance />);

    expect(screen.getByRole('status')).toHaveTextContent(
      CHAT_TOOL_STEP_LIMIT_AFFORDANCE_MESSAGE
    );
    const button = screen.getByRole('button', { name: 'Continue' });
    await user.click(button);
    expect(prompts).toHaveBeenCalledWith('continue');

    button.focus();
    await user.keyboard('{Enter}');
    expect(prompts).toHaveBeenCalledTimes(2);
    await expectNoA11yViolations(container);
  });

  it('stays axe-clean inside a right-to-left transcript', async () => {
    const { container } = render(
      <div dir='rtl'>
        <ChatStepLimitAffordance />
      </div>
    );

    expect(screen.getByRole('button', { name: 'Continue' })).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
