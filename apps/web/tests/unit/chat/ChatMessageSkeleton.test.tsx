import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ChatMessageSkeleton } from '@/components/jovie/components/ChatMessageSkeleton';

describe('ChatMessageSkeleton', () => {
  it('renders without errors', () => {
    const { container } = render(<ChatMessageSkeleton />);
    expect(container.firstChild).toBeTruthy();
  });

  it('uses the correct max-width matching JovieChat message container', () => {
    const { container } = render(<ChatMessageSkeleton />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('max-w-[44rem]');
  });

  it('is hidden from assistive technology', () => {
    const { container } = render(<ChatMessageSkeleton />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.getAttribute('aria-hidden')).toBe('true');
  });

  it('renders assistant and user message skeletons', () => {
    const { container } = render(<ChatMessageSkeleton />);
    const justifyStart = container.querySelectorAll('.justify-start');
    const justifyEnd = container.querySelectorAll('.justify-end');
    expect(justifyStart.length).toBe(1);
    expect(justifyEnd.length).toBe(1);
  });

  it('matches snapshot', () => {
    const { container } = render(<ChatMessageSkeleton />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
