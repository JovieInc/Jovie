import { afterEach, describe, expect, it } from 'vitest';
import {
  isMoneyHiddenCookieValue,
  isWorkspaceLockCookieValue,
  MONEY_HIDDEN_COOKIE,
  WORKSPACE_LOCK_COOKIE,
} from './workspace-lock';

afterEach(() => {
  document.cookie = `${WORKSPACE_LOCK_COOKIE}=; path=/; Max-Age=0`;
  document.cookie = `${MONEY_HIDDEN_COOKIE}=; path=/; Max-Age=0`;
});

describe('workspace lock cookies', () => {
  it('treats only "1" as locked / hidden', () => {
    expect(isWorkspaceLockCookieValue('1')).toBe(true);
    expect(isWorkspaceLockCookieValue('0')).toBe(false);
    expect(isWorkspaceLockCookieValue(undefined)).toBe(false);
    expect(isWorkspaceLockCookieValue(null)).toBe(false);
    expect(isMoneyHiddenCookieValue('1')).toBe(true);
    expect(isMoneyHiddenCookieValue('yes')).toBe(false);
  });
});
