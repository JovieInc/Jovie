'use client';

import { Button } from '@jovie/ui';
import { CHAT_TOOL_STEP_LIMIT_AFFORDANCE_MESSAGE } from '@/lib/chat/tool-step-limit';

function submitContinuePrompt(): void {
  globalThis.dispatchEvent(
    new CustomEvent('jovie-chat-submit-prompt', {
      detail: { prompt: 'continue' },
    })
  );
}

export function ChatStepLimitAffordance() {
  return (
    <div
      data-testid='chat-step-limit-affordance'
      className='system-b-chat-step-limit-affordance'
      role='status'
    >
      <p className='system-b-chat-step-limit-affordance-message'>
        {CHAT_TOOL_STEP_LIMIT_AFFORDANCE_MESSAGE}
      </p>
      <Button
        type='button'
        variant='ghost'
        size='sm'
        onClick={submitContinuePrompt}
        className='h-7 px-2 text-2xs'
      >
        Continue
      </Button>
    </div>
  );
}
