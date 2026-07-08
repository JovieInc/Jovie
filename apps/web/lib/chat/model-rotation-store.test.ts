import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CHAT_MODEL,
  CHAT_MODEL_ROTATION_CHAIN,
  resolveRotatedChatModel,
} from '@/lib/constants/ai-models';
import {
  AUTO_REVERT_CLEAN_STREAK,
  friendlyModelLabel,
  modelRotationNoticeForStep,
  readModelRotationStep,
  recordAssistantTurnClean,
  recordThumbsDownRotation,
  resetModelRotationStoreForTests,
  subscribeModelRotation,
  undoThumbsDownRotation,
} from './model-rotation-store';

const CONVO = 'conv-a';
const OTHER = 'conv-b';
const MAX_STEP = CHAT_MODEL_ROTATION_CHAIN.length - 1;

describe('model-rotation-store', () => {
  beforeEach(() => {
    resetModelRotationStoreForTests();
  });

  it('starts every conversation at step 0 (default model)', () => {
    expect(readModelRotationStep(CONVO)).toBe(0);
    expect(readModelRotationStep(null)).toBe(0);
  });

  it('a thumbs-down advances the rotation step', () => {
    recordThumbsDownRotation(CONVO);
    expect(readModelRotationStep(CONVO)).toBe(Math.min(1, MAX_STEP));
  });

  it('rotation is per-conversation, never global', () => {
    recordThumbsDownRotation(CONVO);
    expect(readModelRotationStep(OTHER)).toBe(0);
    expect(readModelRotationStep(null)).toBe(0);
  });

  it('repeated thumbs-downs clamp at the end of the chain', () => {
    for (let i = 0; i < 10; i++) {
      recordThumbsDownRotation(CONVO);
    }
    expect(readModelRotationStep(CONVO)).toBe(MAX_STEP);
  });

  it('undoing a thumbs-down steps back toward the default', () => {
    recordThumbsDownRotation(CONVO);
    undoThumbsDownRotation(CONVO);
    expect(readModelRotationStep(CONVO)).toBe(0);
    // Undo with no prior rotation is a no-op.
    undoThumbsDownRotation(CONVO);
    expect(readModelRotationStep(CONVO)).toBe(0);
  });

  it(`auto-reverts to the default model after ${AUTO_REVERT_CLEAN_STREAK} clean assistant turns`, () => {
    recordThumbsDownRotation(CONVO);
    for (let i = 0; i < AUTO_REVERT_CLEAN_STREAK - 1; i++) {
      recordAssistantTurnClean(CONVO);
      expect(readModelRotationStep(CONVO)).toBeGreaterThan(0);
    }
    recordAssistantTurnClean(CONVO);
    expect(readModelRotationStep(CONVO)).toBe(0);
  });

  it('a new thumbs-down resets the clean streak', () => {
    recordThumbsDownRotation(CONVO);
    recordAssistantTurnClean(CONVO);
    recordAssistantTurnClean(CONVO);
    // 👎 arrives before the third clean turn — streak must restart.
    recordThumbsDownRotation(CONVO);
    recordAssistantTurnClean(CONVO);
    recordAssistantTurnClean(CONVO);
    expect(readModelRotationStep(CONVO)).toBeGreaterThan(0);
    recordAssistantTurnClean(CONVO);
    expect(readModelRotationStep(CONVO)).toBe(0);
  });

  it('clean turns on a non-rotated conversation are a no-op', () => {
    recordAssistantTurnClean(CONVO);
    expect(readModelRotationStep(CONVO)).toBe(0);
  });

  it('notifies subscribers on every mutation', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeModelRotation(listener);
    recordThumbsDownRotation(CONVO);
    expect(listener).toHaveBeenCalledTimes(1);
    recordAssistantTurnClean(CONVO);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    recordThumbsDownRotation(CONVO);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('modelRotationNoticeForStep is null at step 0 and names the rotated model above it', () => {
    expect(modelRotationNoticeForStep(0)).toBeNull();
    const notice = modelRotationNoticeForStep(1);
    expect(notice).toContain('Switched to');
    expect(notice).toContain(friendlyModelLabel(resolveRotatedChatModel(1)));
  });

  it('friendlyModelLabel produces a human-readable name', () => {
    expect(friendlyModelLabel('google/gemini-2.5-pro')).toBe('Gemini 2.5 Pro');
  });
});

describe('resolveRotatedChatModel (server-side clamp)', () => {
  it('returns the default model for step 0, undefined, negatives, and non-integers', () => {
    expect(resolveRotatedChatModel(0)).toBe(CHAT_MODEL);
    expect(resolveRotatedChatModel(undefined)).toBe(CHAT_MODEL);
    expect(resolveRotatedChatModel(-3)).toBe(CHAT_MODEL);
    expect(resolveRotatedChatModel(1.5)).toBe(CHAT_MODEL);
    expect(resolveRotatedChatModel(Number.NaN)).toBe(CHAT_MODEL);
  });

  it('selects chain entries and clamps out-of-range steps to the last entry', () => {
    expect(resolveRotatedChatModel(1)).toBe(CHAT_MODEL_ROTATION_CHAIN[1]);
    expect(resolveRotatedChatModel(999)).toBe(
      CHAT_MODEL_ROTATION_CHAIN[CHAT_MODEL_ROTATION_CHAIN.length - 1]
    );
  });

  it('never returns a model outside the vetted chain', () => {
    for (const step of [0, 1, 2, 3, 8, 100]) {
      expect(CHAT_MODEL_ROTATION_CHAIN).toContain(
        resolveRotatedChatModel(step)
      );
    }
  });
});
