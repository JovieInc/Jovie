import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  DeviceFrame,
  type DeviceType,
} from '@/features/product-shots/frames/DeviceFrame';

describe('DeviceFrame', () => {
  it('renders children without wrapper when device is none', () => {
    render(
      <DeviceFrame device='none'>
        <div data-testid='content'>Hello</div>
      </DeviceFrame>
    );
    const content = screen.getByTestId('content');
    expect(content.textContent).toBe('Hello');
    // No wrapper frame element — content's parent should be the test container
    expect(content.parentElement?.className).not.toContain('border-');
  });

  it('renders MacBook frame', () => {
    const { container } = render(
      <DeviceFrame device='macbook'>
        <div data-testid='content'>MacBook</div>
      </DeviceFrame>
    );
    expect(screen.getByTestId('content')).toBeTruthy();
    // MacBook frame has a chin/hinge gradient
    expect(container.innerHTML).toContain('gradient');
  });

  it('renders iPhone frame with Dynamic Island', () => {
    const { container } = render(
      <DeviceFrame device='iphone'>
        <div data-testid='content'>iPhone</div>
      </DeviceFrame>
    );
    expect(screen.getByTestId('content')).toBeTruthy();
    // iPhone frame has rounded-[40px] class for the outer bezel
    expect(container.innerHTML).toContain('rounded-[40px]');
  });

  it('renders iPad frame', () => {
    const { container } = render(
      <DeviceFrame device='ipad'>
        <div data-testid='content'>iPad</div>
      </DeviceFrame>
    );
    expect(screen.getByTestId('content')).toBeTruthy();
    // iPad frame has rounded-[18px] class
    expect(container.innerHTML).toContain('rounded-[18px]');
  });

  it('handles all DeviceType values', () => {
    const deviceTypes: DeviceType[] = ['none', 'macbook', 'iphone', 'ipad'];
    for (const deviceType of deviceTypes) {
      const { unmount } = render(
        <DeviceFrame device={deviceType}>
          <span>test</span>
        </DeviceFrame>
      );
      unmount();
    }
  });
});
