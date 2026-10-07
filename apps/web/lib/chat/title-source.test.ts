import { describe, expect, it } from 'vitest';
import { conversationTitleSource } from './title-source';

const workId = '808c9f4d-505c-4000-8000-000000000001';

describe('conversation auto-title source', () => {
  it('extracts the actual work title from the existing Ask Jovie transport envelope', () => {
    expect(
      conversationTitleSource(
        `Help me with this work.\n${JSON.stringify({ workId, workTitle: 'Midnight Drive', artist: 'Artist', revision: '2026-10-06' })}`
      )
    ).toEqual({ text: 'Midnight Drive', deterministic: true });
  });

  it('never uses a task identifier when the envelope has no usable subject', () => {
    expect(
      conversationTitleSource(
        `Help me with this work.\n${JSON.stringify({ workId, workTitle: workId })}`
      )
    ).toEqual({ text: 'Work discussion', deterministic: true });
  });

  it('keeps the known production probe label and excludes its reply instruction', () => {
    expect(
      conversationTitleSource(
        'Prod health check: reply with OK and no other text'
      )
    ).toEqual({ text: 'Prod health check', deterministic: true });
  });

  it('preserves a normal discussion about health or quoted JSON', () => {
    expect(conversationTitleSource('Help me improve audience health')).toEqual({
      text: 'Help me improve audience health',
      deterministic: false,
    });
    expect(
      conversationTitleSource('Discuss "workId" in our documentation')
        .deterministic
    ).toBe(false);
  });

  it('keeps a malformed or oversized work envelope out of the title model prompt', () => {
    for (const input of [
      'Help me with this work.\n{"workId":',
      `Help me with this work.\n${'x'.repeat(20_000)}`,
    ]) {
      expect(conversationTitleSource(input)).toEqual({
        text: 'Work discussion',
        deterministic: true,
      });
    }
  });

  it('renders the actual subject token and retains Unicode and internal quotes', () => {
    expect(
      conversationTitleSource(
        `Help me with this work.\n${JSON.stringify({ workId, workTitle: '夜の歌 "Live" 🎵' })}`
      ).text
    ).toBe('夜の歌 "Live" 🎵');
  });
});
