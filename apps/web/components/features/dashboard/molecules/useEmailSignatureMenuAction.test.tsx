import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { EmailSignatureInput } from '@/lib/email-signature/build-signature';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { useEmailSignatureMenuAction } from './useEmailSignatureMenuAction';

const input: EmailSignatureInput = {
  name: 'Sasha Waves',
  handle: 'sashawaves',
  tagline: 'Independent artist',
  avatarUrl: null,
  socials: [{ label: 'Instagram', url: 'https://instagram.com/sashawaves' }],
  latestRelease: null,
};

function Harness({
  input: value,
}: {
  readonly input: EmailSignatureInput | null;
}) {
  const { action, modal } = useEmailSignatureMenuAction(value);
  return (
    <main>
      <button type='button' disabled={action.disabled} onClick={action.onClick}>
        {action.label}
      </button>
      {modal}
    </main>
  );
}

// The preview iframe's document never loads in jsdom; audit the frame
// element itself, not its contents.
const AXE_OPTIONS = { iframes: false } as const;

describe('useEmailSignatureMenuAction', () => {
  it('opens the signature preview from the menu action and closes it', async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness input={input} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    await expectNoA11yViolations(container, AXE_OPTIONS);

    await user.click(screen.getByRole('button', { name: 'Email signature' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Email Signature');
    expect(screen.getByTestId('email-signature-preview')).toBeInTheDocument();
    await expectNoA11yViolations(document.body, AXE_OPTIONS);

    await user.click(within(dialog).getByRole('button', { name: /close/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('disables the action until profile data exists', async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness input={null} />);
    const action = screen.getByRole('button', { name: 'Email signature' });
    expect(action).toBeDisabled();
    await user.click(action);
    expect(screen.queryByRole('dialog')).toBeNull();
    await expectNoA11yViolations(container, AXE_OPTIONS);
  });

  it('builds a preview for long and right-to-left profiles', async () => {
    const user = userEvent.setup();
    render(
      <div dir='rtl' lang='ar'>
        <Harness
          input={{
            ...input,
            name: 'ليلى حداد',
            tagline:
              'فنانة مستقلة ومنتجة موسيقية من بيروت تجول في كل موسم مهرجانات عبر أوروبا وأمريكا الشمالية وآسيا',
          }}
        />
      </div>
    );
    await user.click(screen.getByRole('button', { name: 'Email signature' }));
    const preview = await screen.findByTestId('email-signature-preview');
    expect(preview.getAttribute('srcdoc')).toContain('ليلى حداد');
    await expectNoA11yViolations(document.body, AXE_OPTIONS);
  });
});
