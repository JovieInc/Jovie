import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ComponentProps, createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DesktopAuthMethodOptions } from './DesktopAuthMethodOptions';

type Props = ComponentProps<typeof DesktopAuthMethodOptions>;

function renderOptions(overrides: Partial<Props> = {}) {
  const props: Props = {
    cancelButton: <button type='button'>Cancel Sign-in</button>,
    browserOptionRef: createRef(),
    canRedeemCode: false,
    codeOptionRef: createRef(),
    copyLabel: 'Copy Sign-in Link',
    copyOptionRef: createRef(),
    disabled: false,
    disclosureRef: createRef(),
    onCopy: vi.fn(),
    onSelectBrowser: vi.fn(),
    onSelectCode: vi.fn(),
    onSelectQr: vi.fn(),
    onSelectTouchId: vi.fn(),
    onToggle: vi.fn(),
    open: false,
    optionsId: 'desktop-auth-options',
    qrOptionRef: createRef(),
    selectedMethod: 'browser',
    showTouchId: false,
    touchIdOptionRef: createRef(),
    ...overrides,
  };
  const view = render(
    <main>
      <DesktopAuthMethodOptions {...props} />
    </main>
  );
  return { ...view, props };
}

const optionRows = () =>
  within(screen.getByTestId('desktop-auth-options'))
    .getAllByRole('button')
    .map(button => button.textContent);

describe('DesktopAuthMethodOptions', () => {
  it('renders a collapsed disclosure beside the cancel action', async () => {
    const { container, props } = renderOptions();

    const disclosure = screen.getByRole('button', {
      name: 'Other Sign-in Options',
    });
    expect(disclosure).toHaveAttribute('aria-expanded', 'false');
    expect(disclosure).toHaveAttribute('aria-controls', 'desktop-auth-options');
    expect(props.disclosureRef.current).toBe(disclosure);
    expect(
      screen.getByRole('button', { name: 'Cancel Sign-in' })
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('desktop-auth-options')
    ).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('toggles the disclosure on click', async () => {
    const user = userEvent.setup();
    const { props } = renderOptions();

    await user.click(
      screen.getByRole('button', { name: 'Other Sign-in Options' })
    );

    expect(props.onToggle).toHaveBeenCalledTimes(1);
  });

  it('offers only the copy link when the bridge cannot redeem codes', async () => {
    const user = userEvent.setup();
    const { container, props } = renderOptions({ open: true });

    const group = screen.getByRole('group', { name: 'Other Sign-in Options' });
    expect(group).toHaveAttribute('id', 'desktop-auth-options');
    expect(
      screen.getByRole('button', { name: 'Other Sign-in Options' })
    ).toHaveAttribute('aria-expanded', 'true');
    expect(optionRows()).toEqual(['Copy Sign-in Link']);

    await user.click(screen.getByRole('button', { name: 'Copy Sign-in Link' }));
    expect(props.onCopy).toHaveBeenCalledTimes(1);
    expect(props.copyOptionRef.current).toHaveTextContent('Copy Sign-in Link');
    await expectNoA11yViolations(container);
  });

  it('lists Touch ID, copy, code and QR when every method is available', async () => {
    const user = userEvent.setup();
    const { container, props } = renderOptions({
      open: true,
      canRedeemCode: true,
      showTouchId: true,
    });

    expect(optionRows()).toEqual([
      'Sign In With Touch ID',
      'Copy Sign-in Link',
      'Enter A Code',
      'Scan With Phone',
    ]);

    await user.click(
      screen.getByRole('button', { name: 'Sign In With Touch ID' })
    );
    await user.click(screen.getByRole('button', { name: 'Enter A Code' }));
    await user.click(screen.getByRole('button', { name: 'Scan With Phone' }));
    expect(props.onSelectTouchId).toHaveBeenCalledTimes(1);
    expect(props.onSelectCode).toHaveBeenCalledTimes(1);
    expect(props.onSelectQr).toHaveBeenCalledTimes(1);
    expect(props.touchIdOptionRef.current).not.toBeNull();
    expect(props.codeOptionRef.current).not.toBeNull();
    expect(props.qrOptionRef.current).not.toBeNull();
    await expectNoA11yViolations(container);
  });

  it('offers the browser instead of Touch ID while Touch ID is selected', async () => {
    const user = userEvent.setup();
    const { container, props } = renderOptions({
      open: true,
      showTouchId: true,
      selectedMethod: 'touch-id',
    });

    expect(optionRows()).toEqual(['Continue In Browser', 'Copy Sign-in Link']);
    await user.click(
      screen.getByRole('button', { name: 'Continue In Browser' })
    );
    expect(props.onSelectBrowser).toHaveBeenCalledTimes(1);
    expect(props.browserOptionRef.current).not.toBeNull();
    await expectNoA11yViolations(container);
  });

  it('disables the disclosure and every option while an action is in flight', async () => {
    const user = userEvent.setup();
    const { container, props } = renderOptions({
      open: true,
      canRedeemCode: true,
      disabled: true,
    });

    for (const name of [
      'Other Sign-in Options',
      'Copy Sign-in Link',
      'Enter A Code',
      'Scan With Phone',
    ]) {
      expect(screen.getByRole('button', { name })).toBeDisabled();
    }
    await user.click(screen.getByRole('button', { name: 'Enter A Code' }));
    expect(props.onSelectCode).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'Cancel Sign-in' })
    ).toBeEnabled();
    await expectNoA11yViolations(container);
  });
});
