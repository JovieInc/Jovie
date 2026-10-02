import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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
  });
});
