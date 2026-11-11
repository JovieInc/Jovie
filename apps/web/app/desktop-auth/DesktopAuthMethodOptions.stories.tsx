import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { createRef, useState } from 'react';
import { DesktopAuthMethodOptions } from './DesktopAuthMethodOptions';
import { DesktopAuthCancelButton } from './DesktopAuthSharedView';
import type { SelectedMethod } from './desktop-auth-contract';

type HarnessProps = Readonly<{
  canRedeemCode?: boolean;
  disabled?: boolean;
  initiallyOpen?: boolean;
  selectedMethod?: SelectedMethod;
  showTouchId?: boolean;
}>;

/** Owns the disclosure state the way DesktopAuthHandoffActions does. */
function MethodOptionsHarness({
  canRedeemCode = false,
  disabled = false,
  initiallyOpen = false,
  selectedMethod = 'browser',
  showTouchId = false,
}: HarnessProps) {
  const [open, setOpen] = useState(initiallyOpen);
  const noop = () => undefined;
  return (
    <div className='flex w-90 flex-col items-center gap-3'>
      <DesktopAuthMethodOptions
        cancelButton={<DesktopAuthCancelButton onCancel={noop} />}
        browserOptionRef={createRef()}
        canRedeemCode={canRedeemCode}
        codeOptionRef={createRef()}
        copyLabel='Copy Sign-in Link'
        copyOptionRef={createRef()}
        disabled={disabled}
        disclosureRef={createRef()}
        onCopy={noop}
        onSelectBrowser={noop}
        onSelectCode={noop}
        onSelectQr={noop}
        onSelectTouchId={noop}
        onToggle={() => setOpen(value => !value)}
        open={open}
        optionsId='desktop-auth-options-story'
        qrOptionRef={createRef()}
        selectedMethod={selectedMethod}
        showTouchId={showTouchId}
        touchIdOptionRef={createRef()}
      />
    </div>
  );
}

const meta = {
  title: 'Auth/Desktop/DesktopAuthMethodOptions',
  component: MethodOptionsHarness,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof MethodOptionsHarness>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Closed: the utility row only. */
export const Closed: Story = {};

/** A browser build without the return-code bridge: copy is the only option. */
export const OpenCopyOnly: Story = { args: { initiallyOpen: true } };

/** The Mac app with code redemption and Touch ID enrolled. */
export const OpenAllMethods: Story = {
  args: { initiallyOpen: true, canRedeemCode: true, showTouchId: true },
};

/** Touch ID is the active method, so the list offers the browser instead. */
export const OpenTouchIdSelected: Story = {
  args: {
    initiallyOpen: true,
    canRedeemCode: true,
    showTouchId: true,
    selectedMethod: 'touch-id',
  },
};

/** An action is in flight: every row is disabled. */
export const Disabled: Story = {
  args: { initiallyOpen: true, canRedeemCode: true, disabled: true },
};
