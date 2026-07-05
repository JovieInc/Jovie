import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ChatStepLimitAffordance } from '@/components/jovie/components/ChatStepLimitAffordance';
import {
  createInitialChatTimelineState,
  reduceChatTimeline,
  selectRenderableMessages,
} from '@/components/jovie/timeline/chat-timeline';
import { ToolPartsRenderer } from '@/components/jovie/tool-ui';
import { CHAT_TOOL_STEP_LIMIT_AFFORDANCE_MESSAGE } from '@/lib/chat/tool-step-limit';
import { fastRender } from '@/tests/utils/fast-render';

function textPart(text: string) {
  return { type: 'text' as const, text };
}

describe('chat terminal states', () => {
  describe('step-limit affordance', () => {
    it('renders the continue affordance on assistant messages', () => {
      fastRender(<ChatStepLimitAffordance />);

      expect(
        screen.getByTestId('chat-step-limit-affordance')
      ).toBeInTheDocument();
      expect(
        screen.getByText(CHAT_TOOL_STEP_LIMIT_AFFORDANCE_MESSAGE)
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Continue' })
      ).toBeInTheDocument();
    });

    it('stores toolStepCapExhausted on completed assistant turns', () => {
      const sending = reduceChatTimeline(createInitialChatTimelineState(), {
        type: 'message.send.started',
        conversationId: null,
        clientTurnId: 'turn_client_1',
        clientMessageId: 'turn_client_1:user',
        requestId: 'req_1',
        parts: [textPart('Plan my release')],
        now: 100,
      });

      const completed = reduceChatTimeline(sending, {
        type: 'assistant.stream.completed',
        conversationId: null,
        clientTurnId: 'turn_client_1',
        requestId: 'req_1',
        parts: [textPart('Here is step one.')],
        toolStepCapExhausted: true,
        now: 200,
      });

      expect(selectRenderableMessages(completed)[1]).toMatchObject({
        role: 'assistant',
        status: 'complete',
        toolStepCapExhausted: true,
      });
    });
  });

  describe('failed artifact cards', () => {
    it('renders a failed album-art artifact card with retry', () => {
      fastRender(
        <ToolPartsRenderer
          variant='chat'
          profileId='profile_1'
          parts={[
            {
              type: 'dynamic-tool',
              toolName: 'generateAlbumArt',
              toolCallId: 'tool-album-art-1',
              state: 'output-error',
              errorText: 'Image provider unavailable.',
              output: {
                success: false,
                retryable: true,
                error: 'Image provider unavailable.',
              },
            },
          ]}
        />
      );

      expect(
        screen.getByTestId('chat-artifact-error-card')
      ).toBeInTheDocument();
      expect(screen.getByText('Album Art Failed')).toBeInTheDocument();
      expect(
        screen.getByText('Image provider unavailable.')
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    });

    it('renders a failed pitch artifact card with retry', () => {
      fastRender(
        <ToolPartsRenderer
          variant='chat'
          parts={[
            {
              type: 'dynamic-tool',
              toolName: 'generateReleasePitch',
              toolCallId: 'tool-pitch-1',
              state: 'output-error',
              errorText: 'Pitch model timed out.',
            },
          ]}
        />
      );

      expect(
        screen.getByTestId('chat-artifact-error-card')
      ).toBeInTheDocument();
      expect(screen.getByText('Pitch Generation Failed')).toBeInTheDocument();
      expect(screen.getByText('Pitch model timed out.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    });
  });

  describe('stop with no assistant content', () => {
    it('completes empty assistant turns without injecting failure copy', () => {
      const sending = reduceChatTimeline(createInitialChatTimelineState(), {
        type: 'message.send.started',
        conversationId: null,
        clientTurnId: 'turn_client_1',
        clientMessageId: 'turn_client_1:user',
        requestId: 'req_1',
        parts: [textPart('Hello')],
        now: 100,
      });

      const completed = reduceChatTimeline(sending, {
        type: 'assistant.stream.completed',
        conversationId: null,
        clientTurnId: 'turn_client_1',
        requestId: 'req_1',
        parts: [],
        now: 200,
      });

      const assistantMessage = selectRenderableMessages(completed).find(
        message => message.role === 'assistant'
      );

      expect(assistantMessage).toMatchObject({
        status: 'complete',
        parts: [],
      });
      expect(
        assistantMessage?.parts.some(
          part => 'text' in part && part.text === 'Response stopped.'
        )
      ).toBe(false);
    });
  });
});
