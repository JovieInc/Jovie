import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { type FormEvent, useId, useState } from 'react';
import { InlineSubscribe } from './inline-subscribe';

const meta: Meta<typeof InlineSubscribe> = {
  title: 'UI/Atoms/InlineSubscribe',
  component: InlineSubscribe,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => {
    const [value, setValue] = useState('');
    return (
      <form className='w-96' onSubmit={event => event.preventDefault()}>
        <InlineSubscribe
          ariaLabel='Email address'
          buttonLabel='Subscribe'
          value={value}
          onValueChange={setValue}
        />
      </form>
    );
  },
};

type SubscribeStatus = 'idle' | 'submitting' | 'error' | 'offline';

const STATUS_MESSAGES: Record<Exclude<SubscribeStatus, 'idle'>, string> = {
  submitting: 'Subscribing…',
  error: 'We could not subscribe that address. Check it and try again.',
  offline:
    'You are offline. Your email stays here; subscribe again once you reconnect.',
};

interface SubscribeFixtureProps {
  readonly initialValue?: string;
  readonly initialStatus?: SubscribeStatus;
  /** What the mocked submit handler settles to after a short delay. */
  readonly outcome?: Exclude<SubscribeStatus, 'submitting'>;
  readonly ariaLabel?: string;
  readonly buttonLabel?: string;
  readonly placeholder?: string;
  readonly className?: string;
}

/**
 * Parent-owned form, as in product: it owns the `<form>`, the request status
 * and the single microcopy line. Only the submit handler is mocked.
 */
function SubscribeFixture({
  initialValue = '',
  initialStatus = 'idle',
  outcome = 'idle',
  ariaLabel = 'Email address',
  buttonLabel = 'Subscribe',
  placeholder,
  className = 'w-96',
}: SubscribeFixtureProps) {
  const messageId = useId();
  const [value, setValue] = useState(initialValue);
  const [status, setStatus] = useState<SubscribeStatus>(initialStatus);
  const submitting = status === 'submitting';

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus('submitting');
    globalThis.setTimeout(() => setStatus(outcome), 1200);
  };

  return (
    <form className={className} onSubmit={handleSubmit}>
      <InlineSubscribe
        ariaLabel={ariaLabel}
        buttonLabel={buttonLabel}
        placeholder={placeholder}
        value={value}
        onValueChange={next => {
          setValue(next);
          if (status === 'error') setStatus('idle');
        }}
        loading={submitting}
        pending={submitting}
        invalid={status === 'error'}
        describedBy={messageId}
      />
      <p
        id={messageId}
        role='status'
        className={
          status === 'error'
            ? 'mt-2 min-h-5 text-xs text-error-text'
            : 'mt-2 min-h-5 text-xs text-secondary-token'
        }
      >
        {status === 'idle' ? '' : STATUS_MESSAGES[status]}
      </p>
    </form>
  );
}

export const Loading: Story = {
  render: () => (
    <SubscribeFixture
      initialValue='fan@example.com'
      initialStatus='submitting'
    />
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Request in flight: loading shows the button spinner and pending freezes the typed email without changing the pill geometry.',
      },
    },
  },
};

export const ErrorState: Story = {
  render: () => (
    <SubscribeFixture
      initialValue='fan@example'
      initialStatus='error'
      outcome='error'
    />
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Rejected on submit: the field is marked invalid and linked to the parent’s one error line; editing the email clears it.',
      },
    },
  },
};

export const PartialEmail: Story = {
  render: () => <SubscribeFixture initialValue='fan@exa' outcome='error' />,
  parameters: {
    docs: {
      description: {
        story:
          'Partly typed email: the button stays enabled (never a grey disabled state) and validation happens on submit.',
      },
    },
  },
};

export const LongContent: Story = {
  render: () => (
    <SubscribeFixture
      className='w-72'
      initialValue='independent.artist.management.team@verylonglabelname.example.com'
      buttonLabel='Get release updates'
    />
  ),
  parameters: {
    docs: {
      description: {
        story:
          'A long email and a long button label in a narrow form: the field shrinks and scrolls its text while the button keeps its full label.',
      },
    },
  },
};

export const Offline: Story = {
  render: () => (
    <SubscribeFixture
      initialValue='fan@example.com'
      initialStatus='offline'
      outcome='offline'
    />
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Submit failed with no connection: the typed email is kept, the button stays available to retry, and the parent line explains why.',
      },
    },
  },
};

export const Rtl: Story = {
  render: () => (
    <div dir='rtl'>
      <SubscribeFixture
        className='w-80'
        ariaLabel='البريد الإلكتروني'
        buttonLabel='اشترك في التحديثات'
        placeholder='you@email.com'
      />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Right-to-left form: the button sits at the inline end and the Arabic label fits without overflowing the pill.',
      },
    },
  },
};
