import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

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

  it('signals only after the destination surface is ready', async () => {
    const { container, rerender } = render(
      <NavigationDestinationReady destination='calendar' ready={false} />
    );
    expect(mockMarkNavigationDestinationReady).not.toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
    await expectNoA11yViolations(container);

    rerender(
      <NavigationDestinationReady destination='calendar' ready={true} />
    );
    expect(mockMarkNavigationDestinationReady).toHaveBeenCalledExactlyOnceWith(
      'calendar'
    );
    expect(container).toBeEmptyDOMElement();
    await expectNoA11yViolations(container);
  });

  it('defaults to ready and signals once per destination', async () => {
    const { container, rerender } = render(
      <NavigationDestinationReady destination='library' />
    );
    expect(mockMarkNavigationDestinationReady).toHaveBeenCalledExactlyOnceWith(
      'library'
    );

    rerender(<NavigationDestinationReady destination='library' />);
    expect(mockMarkNavigationDestinationReady).toHaveBeenCalledTimes(1);

    rerender(<NavigationDestinationReady destination='calendar' />);
    expect(mockMarkNavigationDestinationReady).toHaveBeenLastCalledWith(
      'calendar'
    );
    await expectNoA11yViolations(container);
  });
});
