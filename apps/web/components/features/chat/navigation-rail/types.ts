import type { MessagePart } from '@/components/jovie/types';

export interface ChatNavMessage {
  readonly id: string;
  readonly role: 'user' | 'assistant' | 'system';
  readonly parts: readonly MessagePart[];
  readonly clientTurnId?: string;
  /** Canonical timeline revision, including updates that reuse a parts array. */
  readonly streamRevision?: number;
}

export interface ThreadTurn {
  readonly id: string;
  readonly messageIndex: number;
  readonly preview: string;
  readonly turnNumber: number;
}
