import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useDisclosure, useDisclosureGroup } from '@/hooks/useDisclosure';

describe('useDisclosure', () => {
  it('should start closed by default', () => {
    const { result } = renderHook(() => useDisclosure());
    expect(result.current.isOpen).toBe(false);
  });

  it('should start open when defaultOpen is true', () => {
    const { result } = renderHook(() => useDisclosure({ defaultOpen: true }));
    expect(result.current.isOpen).toBe(true);
  });

  it('should open when open() is called', () => {
    const { result } = renderHook(() => useDisclosure());

    act(() => {
      result.current.open();
    });

    expect(result.current.isOpen).toBe(true);
  });

  it('should close when close() is called', () => {
    const { result } = renderHook(() => useDisclosure({ defaultOpen: true }));

    act(() => {
      result.current.close();
    });

    expect(result.current.isOpen).toBe(false);
  });

  it('should toggle state', () => {
    const { result } = renderHook(() => useDisclosure());

    act(() => {
      result.current.toggle();
    });
    expect(result.current.isOpen).toBe(true);

    act(() => {
      result.current.toggle();
    });
    expect(result.current.isOpen).toBe(false);
  });

  it('should set state directly', () => {
    const { result } = renderHook(() => useDisclosure());

    act(() => {
      result.current.setIsOpen(true);
    });
    expect(result.current.isOpen).toBe(true);

    act(() => {
      result.current.setIsOpen(false);
    });
    expect(result.current.isOpen).toBe(false);
  });

  it('should call onOpen callback', () => {
    const onOpen = vi.fn();
    const { result } = renderHook(() => useDisclosure({ onOpen }));

    act(() => {
      result.current.open();
    });

    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('should call onClose callback', () => {
    const onClose = vi.fn();
    const { result } = renderHook(() =>
      useDisclosure({ defaultOpen: true, onClose })
    );

    act(() => {
      result.current.close();
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('should call onToggle with new state', () => {
    const onToggle = vi.fn();
    const { result } = renderHook(() => useDisclosure({ onToggle }));

    act(() => {
      result.current.toggle();
    });
    expect(onToggle).toHaveBeenCalledWith(true);

    act(() => {
      result.current.toggle();
    });
    expect(onToggle).toHaveBeenCalledWith(false);
  });

  it('should call both onOpen and onToggle when opening via toggle', () => {
    const onOpen = vi.fn();
    const onToggle = vi.fn();
    const { result } = renderHook(() => useDisclosure({ onOpen, onToggle }));

    act(() => {
      result.current.toggle();
    });

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it('should call onClose and onToggle when closing via setIsOpen', () => {
    const onClose = vi.fn();
    const onToggle = vi.fn();
    const { result } = renderHook(() =>
      useDisclosure({ defaultOpen: true, onClose, onToggle })
    );

    act(() => {
      result.current.setIsOpen(false);
    });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith(false);
  });

  describe('getTriggerProps', () => {
    it('should return correct trigger props', () => {
      const { result } = renderHook(() => useDisclosure());
      const props = result.current.getTriggerProps();

      expect(props).toHaveProperty('onClick');
      expect(props['aria-expanded']).toBe(false);
      expect(props['aria-haspopup']).toBe('dialog');
    });

    it('should reflect open state in aria-expanded', () => {
      const { result } = renderHook(() => useDisclosure({ defaultOpen: true }));
      const props = result.current.getTriggerProps();

      expect(props['aria-expanded']).toBe(true);
    });
  });

  describe('getContentProps', () => {
    it('should return correct content props', () => {
      const { result } = renderHook(() => useDisclosure());
      const props = result.current.getContentProps();

      expect(props.open).toBe(false);
      expect(typeof props.onClose).toBe('function');
    });

    it('should reflect open state', () => {
      const { result } = renderHook(() => useDisclosure({ defaultOpen: true }));
      const props = result.current.getContentProps();

      expect(props.open).toBe(true);
    });
  });
});

describe('useDisclosureGroup', () => {
  it('should start with no open keys', () => {
    const { result } = renderHook(() => useDisclosureGroup<string>());

    expect(result.current.isOpen('item1')).toBe(false);
    expect(result.current.openKeys.size).toBe(0);
  });

  it('should open a specific key', () => {
    const { result } = renderHook(() => useDisclosureGroup<string>());

    act(() => {
      result.current.open('item1');
    });

    expect(result.current.isOpen('item1')).toBe(true);
    expect(result.current.isOpen('item2')).toBe(false);
  });

  it('should close a specific key', () => {
    const { result } = renderHook(() => useDisclosureGroup<string>());

    act(() => {
      result.current.open('item1');
    });
    expect(result.current.isOpen('item1')).toBe(true);

    act(() => {
      result.current.close('item1');
    });
    expect(result.current.isOpen('item1')).toBe(false);
  });

  it('should toggle a key', () => {
    const { result } = renderHook(() => useDisclosureGroup<string>());

    act(() => {
      result.current.toggle('item1');
    });
    expect(result.current.isOpen('item1')).toBe(true);

    act(() => {
      result.current.toggle('item1');
    });
    expect(result.current.isOpen('item1')).toBe(false);
  });

  it('should support multiple open keys', () => {
    const { result } = renderHook(() => useDisclosureGroup<string>());

    act(() => {
      result.current.open('item1');
      result.current.open('item2');
    });

    expect(result.current.isOpen('item1')).toBe(true);
    expect(result.current.isOpen('item2')).toBe(true);
  });

  it('should close all keys', () => {
    const { result } = renderHook(() => useDisclosureGroup<string>());

    act(() => {
      result.current.open('item1');
      result.current.open('item2');
      result.current.open('item3');
    });

    act(() => {
      result.current.closeAll();
    });

    expect(result.current.openKeys.size).toBe(0);
    expect(result.current.isOpen('item1')).toBe(false);
  });

  it('should support numeric keys', () => {
    const { result } = renderHook(() => useDisclosureGroup<number>());

    act(() => {
      result.current.open(1);
      result.current.open(2);
    });

    expect(result.current.isOpen(1)).toBe(true);
    expect(result.current.isOpen(3)).toBe(false);
  });
});
