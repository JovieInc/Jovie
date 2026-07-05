import { describe, expect, it } from 'vitest';
import {
  isChatContextTemplatePlaceholder,
  resolveChatRailContextLabel,
} from './context-label';

describe('isChatContextTemplatePlaceholder', () => {
  it('detects wire-syntax template tokens', () => {
    expect(isChatContextTemplatePlaceholder('<title>')).toBe(true);
    expect(isChatContextTemplatePlaceholder('<name>')).toBe(true);
    expect(isChatContextTemplatePlaceholder('<id>')).toBe(true);
  });

  it('ignores real labels and empty values', () => {
    expect(isChatContextTemplatePlaceholder('Midnight Drive')).toBe(false);
    expect(isChatContextTemplatePlaceholder('Tim White')).toBe(false);
    expect(isChatContextTemplatePlaceholder('')).toBe(false);
    expect(isChatContextTemplatePlaceholder(null)).toBe(false);
    expect(isChatContextTemplatePlaceholder(undefined)).toBe(false);
  });
});

describe('resolveChatRailContextLabel', () => {
  it('returns the trimmed label when it is a real value', () => {
    expect(resolveChatRailContextLabel('release', '  Midnight Drive  ')).toBe(
      'Midnight Drive'
    );
  });

  it('falls back to a kind label for template placeholders', () => {
    expect(resolveChatRailContextLabel('release', '<title>')).toBe('Release');
    expect(resolveChatRailContextLabel('artist', '<name>')).toBe('Artist');
    expect(resolveChatRailContextLabel('track', '<title>')).toBe('Track');
  });

  it('falls back to a kind label for empty values', () => {
    expect(resolveChatRailContextLabel('artist', null)).toBe('Artist');
    expect(resolveChatRailContextLabel('track', '   ')).toBe('Track');
    expect(resolveChatRailContextLabel('tour-date', undefined)).toBe(
      'Tour Date'
    );
  });
});
