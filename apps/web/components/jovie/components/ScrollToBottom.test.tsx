import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ChatStickScrollButton, ScrollToBottom } from './ScrollToBottom';

describe('ScrollToBottom', () => {
  it('renders nothing while the transcript is at the bottom', () => {
    const { container } = render(
      <ScrollToBottom visible={false} onClick={vi.fn()} />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('jumps to the latest messages when pressed', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { container } = render(<ScrollToBottom visible onClick={onClick} />);

    await user.click(
      screen.getByRole('button', { name: 'Scroll To Latest Messages' })
    );

    expect(onClick).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('shows the button once the stick-to-bottom store reports it unstuck', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { container } = render(
      <ChatStickScrollButton
        subscribe={() => () => {}}
        getSnapshot={() => false}
        onClick={onClick}
      />
    );

    await user.click(screen.getByRole('button'));

    expect(onClick).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });
});
