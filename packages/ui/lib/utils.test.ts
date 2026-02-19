import { describe, expect, it } from 'vitest';

import { cn } from './utils';

describe('cn', () => {
  it('merges multiple class strings', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('handles a single class string', () => {
    expect(cn('foo')).toBe('foo');
  });

  it('filters out falsy values', () => {
    expect(cn('foo', false && 'bar', 'baz')).toBe('foo baz');
    expect(cn('foo', undefined, null, 'bar')).toBe('foo bar');
    expect(cn('foo', '', 'bar')).toBe('foo bar');
  });

  it('resolves Tailwind conflicts via twMerge', () => {
    expect(cn('p-4', 'p-2')).toBe('p-2');
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500');
    expect(cn('mt-2 mb-4', 'mt-8')).toBe('mb-4 mt-8');
  });

  it('handles conditional class objects', () => {
    expect(cn({ foo: true, bar: false })).toBe('foo');
    expect(cn({ foo: true, bar: true })).toBe('foo bar');
  });

  it('handles mixed inputs', () => {
    expect(cn('base', { active: true, disabled: false }, 'extra')).toBe(
      'base active extra'
    );
  });

  it('returns empty string with no arguments', () => {
    expect(cn()).toBe('');
  });

  it('returns empty string with only falsy arguments', () => {
    expect(cn(undefined, null, false)).toBe('');
  });

  it('handles array inputs', () => {
    expect(cn(['foo', 'bar'])).toBe('foo bar');
  });
});
