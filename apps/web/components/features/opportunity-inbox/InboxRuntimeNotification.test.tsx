import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { InboxRuntimeNotification } from './InboxRuntimeNotification';

type Update = {
  available: boolean;
  busy: boolean;
  title: string;
  description: string;
  apply: () => void;
} | null;

const runtime = vi.hoisted(() => ({ update: null as Update }));

vi.mock('@/components/shell/RuntimeUpdateProvider', () => ({
  useRuntimeUpdate: () => runtime.update,
}));

function setUpdate(overrides: Partial<NonNullable<Update>> = {}) {
  const apply = vi.fn();
  runtime.update = {
    available: true,
    busy: false,
    title: 'Restart Jovie to update',
    description: 'Install the available update when you are ready.',
    apply,
    ...overrides,
  };
  return apply;
}

describe('InboxRuntimeNotification', () => {
  beforeEach(() => {
    runtime.update = null;
  });

  it('renders nothing outside an update provider', async () => {
    const { container } = render(<InboxRuntimeNotification />);

    expect(container).toBeEmptyDOMElement();
    await expectNoA11yViolations(container);
  });

  it('renders nothing when no update is available', async () => {
    setUpdate({ available: false });
    const { container } = render(<InboxRuntimeNotification />);

    expect(screen.queryByTestId('inbox-runtime-notification')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('applies an available update when the card is chosen', async () => {
    const user = userEvent.setup();
    const apply = setUpdate();
    const { container } = render(<InboxRuntimeNotification />);

    expect(
      screen.getByRole('region', { name: 'App Updates' })
    ).toBeInTheDocument();
    const card = screen.getByRole('button', {
      name: 'Restart Jovie to update',
    });
    expect(card).toHaveAccessibleDescription(
      'Install the available update when you are ready.'
    );
    await user.click(card);
    expect(apply).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it('disables the card while the update downloads', async () => {
    const user = userEvent.setup();
    const apply = setUpdate({
      busy: true,
      title: 'Downloading Jovie update…',
      description:
        'The update will be ready to install when the download completes.',
    });
    const { container } = render(<InboxRuntimeNotification />);

    const card = screen.getByRole('button', {
      name: 'Downloading Jovie update…',
    });
    expect(card).toBeDisabled();
    await user.click(card);
    expect(apply).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('stays axe-clean in a right-to-left document', async () => {
    setUpdate({
      title: 'أعد تشغيل جوفي للتحديث',
      description: 'ثبّت التحديث عندما تكون جاهزًا.',
    });
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <InboxRuntimeNotification />
      </div>
    );

    expect(
      screen.getByRole('button', { name: 'أعد تشغيل جوفي للتحديث' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
