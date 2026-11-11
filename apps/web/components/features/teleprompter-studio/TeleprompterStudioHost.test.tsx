import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/dynamic', () => ({
  default: () =>
    function StudioStub(props: {
      context: { title: string };
      onClose: () => void;
    }) {
      return (
        <div data-testid='studio-stub'>
          {props.context.title}
          <button type='button' onClick={props.onClose}>
            close
          </button>
        </div>
      );
    },
}));

import { TeleprompterStudioHost } from '@/components/features/teleprompter-studio/TeleprompterStudioHost';
import { TELEPROMPTER_START_EVENT } from '@/lib/teleprompter/recorder';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

const context = {
  profileId: 'profile_1',
  kind: 'promo',
  title: 'Release day shout-out',
  script: 'Tonight I play it live.',
  showcaseVariant: 'direct',
  source: 'chat_proposal',
};

describe('TeleprompterStudioHost', () => {
  it('opens the studio when Record in app fires and closes on request', () => {
    render(<TeleprompterStudioHost />);
    expect(screen.queryByTestId('studio-stub')).toBeNull();

    act(() => {
      window.dispatchEvent(
        new CustomEvent(TELEPROMPTER_START_EVENT, { detail: context })
      );
    });
    expect(screen.getByTestId('studio-stub').textContent).toContain(
      'Release day shout-out'
    );

    act(() => {
      screen.getByText('close').click();
    });
    expect(screen.queryByTestId('studio-stub')).toBeNull();
  });

  it('ignores malformed start events', () => {
    render(<TeleprompterStudioHost />);
    act(() => {
      window.dispatchEvent(
        new CustomEvent(TELEPROMPTER_START_EVENT, { detail: { title: 'x' } })
      );
    });
    expect(screen.queryByTestId('studio-stub')).toBeNull();
  });

  it('passes axe idle and with the studio open', async () => {
    const { container } = render(<TeleprompterStudioHost />);
    await expectNoA11yViolations(container);
    act(() => {
      globalThis.window.dispatchEvent(
        new CustomEvent(TELEPROMPTER_START_EVENT, { detail: context })
      );
    });
    expect(screen.getByTestId('studio-stub')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
