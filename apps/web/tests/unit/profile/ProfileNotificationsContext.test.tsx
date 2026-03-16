import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useProfileNotifications } from '@/components/organisms/profile-shell';

describe('useProfileNotifications', () => {
  it('returns a safe fallback state when used outside ProfileShell', () => {
    const { result } = renderHook(() => useProfileNotifications());

    expect(result.current.notificationsEnabled).toBe(false);
    expect(result.current.state).toBe('idle');
    expect(result.current.hydrationStatus).toBe('done');
    expect(result.current.hasStoredContacts).toBe(false);
    expect(result.current.subscribedChannels).toEqual({});
    expect(result.current.subscriptionDetails).toEqual({});
  });
});
