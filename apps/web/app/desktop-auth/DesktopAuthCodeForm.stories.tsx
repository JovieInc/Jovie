import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { type FormEvent, useRef, useState } from 'react';
import { DesktopAuthCodeForm } from './DesktopAuthCodeForm';
import {
  DesktopAuthCancelButton,
  DesktopAuthStatus,
} from './DesktopAuthSharedView';
import type { RedeemState } from './desktop-auth-contract';

interface CodeFormStoryProps {
  readonly initialCode: string;
  readonly redeemState: RedeemState;
  readonly status: string;
}

/** Owns the code like DesktopAuthHandoffActions: state, ref and status line. */
function CodeFormStory({
  initialCode,
  redeemState,
  status,
}: CodeFormStoryProps) {
  const [code, setCode] = useState(initialCode);
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className='flex w-90 flex-col items-center px-6 text-center'>
      <DesktopAuthCodeForm
        cancelButton={<DesktopAuthCancelButton onCancel={() => undefined} />}
        inputRef={inputRef}
        onBack={() => undefined}
        onReturnCodeChange={value => setCode(value.toUpperCase())}
        onSubmit={(event: FormEvent<HTMLFormElement>) => event.preventDefault()}
        redeemState={redeemState}
        returnCode={code}
        statusId='desktop-auth-code-status'
      />
      <DesktopAuthStatus id='desktop-auth-code-status' text={status} />
    </div>
  );
}

const meta = {
  title: 'Desktop/DesktopAuthCodeForm',
  component: CodeFormStory,
  parameters: { layout: 'centered' },
  args: {
    initialCode: 'BCDF-GHJK',
    redeemState: 'idle',
    status:
      'Signed in but Jovie did not open? Enter the code shown in your browser or on your phone.',
  },
} satisfies Meta<typeof CodeFormStory>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A complete code, ready to submit. */
export const Default: Story = {};

/** Nothing typed yet: Continue waits for a complete code. */
export const EmptyCode: Story = {
  args: { initialCode: '' },
};

/** The code reached Jovie and did not match; it stays editable. */
export const ErrorCodeRejected: Story = {
  args: {
    redeemState: 'error',
    status: 'That code did not match. Check it and try again.',
  },
};

/** The redeem never reached Jovie; the code stays for a retry. */
export const OfflineRedeemFailed: Story = {
  args: {
    redeemState: 'error',
    status: 'Could not reach Jovie. Check your connection and try again.',
  },
};

/** The code is redeeming: every action waits. */
export const PendingRedeem: Story = {
  args: { redeemState: 'redeeming', status: 'Signing in...' },
};

/** The code form inside a right-to-left window. */
export const Rtl: Story = {
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
