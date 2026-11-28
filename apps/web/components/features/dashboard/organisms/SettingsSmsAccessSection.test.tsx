import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { SettingsSmsAccessSection } from './SettingsSmsAccessSection';

const { mockUseSmsAccessRequestMutation } = vi.hoisted(() => ({
  mockUseSmsAccessRequestMutation: vi.fn(),
}));

vi.mock('@/lib/queries/useSmsAccessRequestMutation', () => ({
  useSmsAccessRequestMutation: mockUseSmsAccessRequestMutation,
}));

describe('SettingsSmsAccessSection', () => {
  it('renders a request failure with the error token, not raw red-* (JOV-6773)', () => {
    mockUseSmsAccessRequestMutation.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isSuccess: false,
      isError: true,
      error: new Error('Request failed'),
    });

    const { container } = render(
      <SettingsSmsAccessSection
        smsSubscriberCount={0}
        alreadyRequested={false}
      />
    );

    const message = container.querySelector('p.text-error');
    expect(message).toHaveTextContent('Request failed');
    expect(message?.className).not.toMatch(/\bred-\d/);
  });

  it('renders the request button when there is no error', () => {
    mockUseSmsAccessRequestMutation.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isSuccess: false,
      isError: false,
      error: null,
    });

    render(
      <SettingsSmsAccessSection
        smsSubscriberCount={0}
        alreadyRequested={false}
      />
    );

    expect(
      screen.getByRole('button', { name: 'Request SMS Access' })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'No SMS subscribers yet. People can sign up on your profile page.'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Let your audience opt in to text alerts when you publish.'
      )
    ).toBeInTheDocument();
  });

  it('counts subscribers without calling them fans', () => {
    mockUseSmsAccessRequestMutation.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isSuccess: false,
      isError: false,
      error: null,
    });

    render(
      <SettingsSmsAccessSection
        smsSubscriberCount={2}
        alreadyRequested={false}
      />
    );

    expect(screen.getByText(/subscribers have/)).toBeInTheDocument();
    expect(screen.queryByText(/fans have/)).not.toBeInTheDocument();
  });

  it('requests access on click and stays axe-clean while pending, failed and requested', async () => {
    const user = userEvent.setup();
    const mutate = vi.fn();
    mockUseSmsAccessRequestMutation.mockReturnValue({
      mutate,
      isPending: false,
      isSuccess: false,
      isError: false,
      error: null,
    });
    const idle = render(
      <SettingsSmsAccessSection
        smsSubscriberCount={1}
        alreadyRequested={false}
      />
    );
    await user.click(
      screen.getByRole('button', { name: 'Request SMS Access' })
    );
    expect(mutate).toHaveBeenCalledOnce();
    await expectNoA11yViolations(idle.container);
    idle.unmount();

    mockUseSmsAccessRequestMutation.mockReturnValue({
      mutate,
      isPending: true,
      isSuccess: false,
      isError: false,
      error: null,
    });
    const pending = render(
      <SettingsSmsAccessSection
        smsSubscriberCount={0}
        alreadyRequested={false}
      />
    );
    expect(
      screen.getByRole('button', { name: 'Requesting...' })
    ).toBeDisabled();
    await expectNoA11yViolations(pending.container);
    pending.unmount();

    mockUseSmsAccessRequestMutation.mockReturnValue({
      mutate,
      isPending: false,
      isSuccess: false,
      isError: true,
      error: new Error('Request failed'),
    });
    const failed = render(
      <SettingsSmsAccessSection
        smsSubscriberCount={0}
        alreadyRequested={false}
      />
    );
    await expectNoA11yViolations(failed.container);
    failed.unmount();

    const requested = render(
      <SettingsSmsAccessSection smsSubscriberCount={5} alreadyRequested />
    );
    expect(screen.getByText(/Request submitted/)).toBeInTheDocument();
    await expectNoA11yViolations(requested.container);
  });
});
