import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { useTableGrouping } from '@/components/organisms/table/utils/useTableGrouping';

type Row = { id: string; group: string };

describe('useTableGrouping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('assigns data-group-key and scopes observer to scroll root', async () => {
    const scrollRoot = document.createElement('div');
    const data: Row[] = [
      { id: '1', group: '2016' },
      { id: '2', group: '2017' },
    ];

    const { result } = renderHook(() =>
      useTableGrouping({
        data,
        getGroupKey: row => row.group,
        getGroupLabel: key => key,
        enabled: true,
        scrollRoot,
      })
    );

    await waitFor(() => {
      expect(global.IntersectionObserver).toHaveBeenCalled();
    });

    const header = document.createElement('tr');
    result.current.observeGroupHeader('2016', header);

    expect(header.dataset.groupKey).toBe('2016');

    const observerMock = global.IntersectionObserver as unknown as Mock;
    const observerInstance = observerMock.mock.instances[0] as {
      observe: Mock;
    };

    expect(observerInstance.observe).toHaveBeenCalledWith(header);

    const options = observerMock.mock.calls[0][1] as IntersectionObserverInit;

    expect(options.root).toBe(scrollRoot);
  });
});
