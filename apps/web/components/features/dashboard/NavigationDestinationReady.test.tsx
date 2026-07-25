import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockMarkNavigationDestinationReady } = vi.hoisted(() => ({
  mockMarkNavigationDestinationReady: vi.fn(),
}));

vi.mock('@/lib/tracking/navigation-telemetry', () => ({
  markNavigationDestinationReady: mockMarkNavigationDestinationReady,
}));

import { NavigationDestinationReady } from './NavigationDestinationReady';

describe('NavigationDestinationReady', () => {
  beforeEach(() => {
    mockMarkNavigationDestinationReady.mockReset();
  });

  it('signals only after the destination surface is ready', () => {
    const { rerender } = render(
      <NavigationDestinationReady destination='calendar' ready={false} />
    );
    expect(mockMarkNavigationDestinationReady).not.toHaveBeenCalled();

    rerender(
      <NavigationDestinationReady destination='calendar' ready={true} />
    );
    expect(mockMarkNavigationDestinationReady).toHaveBeenCalledExactlyOnceWith(
      'calendar'
    );
  });
});
