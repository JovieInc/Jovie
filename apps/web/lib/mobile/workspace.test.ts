import { describe, expect, it } from 'vitest';
import {
  isOvConversationTitle,
  parseMobileWorkspace,
  withOvConversationTitle,
} from './workspace';

describe('parseMobileWorkspace', () => {
  it('defaults omitted values to artist (customer) mode', () => {
    expect(parseMobileWorkspace(undefined)).toEqual({
      ok: true,
      workspace: 'customer',
    });
    expect(parseMobileWorkspace(null)).toEqual({
      ok: true,
      workspace: 'customer',
    });
    expect(parseMobileWorkspace('')).toEqual({
      ok: true,
      workspace: 'customer',
    });
  });

  it('accepts the web app-shell workspace ids', () => {
    expect(parseMobileWorkspace('customer')).toEqual({
      ok: true,
      workspace: 'customer',
    });
    expect(parseMobileWorkspace('ov')).toEqual({
      ok: true,
      workspace: 'ov',
    });
  });

  it('rejects unknown workspace ids', () => {
    expect(parseMobileWorkspace('ovie')).toEqual({ ok: false });
    expect(parseMobileWorkspace('admin')).toEqual({ ok: false });
  });
});

describe('OV conversation title tagging', () => {
  it('tags and detects Summer/ops conversations without a new column', () => {
    expect(isOvConversationTitle(null)).toBe(false);
    expect(isOvConversationTitle('Launch plan')).toBe(false);
    expect(isOvConversationTitle(withOvConversationTitle('Taste cards'))).toBe(
      true
    );
    expect(withOvConversationTitle(withOvConversationTitle('Taste'))).toBe(
      withOvConversationTitle('Taste')
    );
  });
});
