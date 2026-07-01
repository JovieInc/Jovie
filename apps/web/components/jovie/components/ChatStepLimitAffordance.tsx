'use client';

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
      <button
        type='button'
        onClick={submitContinuePrompt}
        className='system-b-chat-step-limit-affordance-button focus-ring'
      >
        Continue
      </button>
    </div>
  );
}
