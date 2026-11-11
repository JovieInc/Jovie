import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';
import { ChangelogEmailSignup } from './ChangelogEmailSignup';

const SUBSCRIBE_PATH = '/api/changelog/subscribe';

/**
 * Stories never reach the subscribe API. Requests to its path get this local
 * answer so every state is deterministic and offline; every other request
 * passes through untouched, and the original fetch returns on unmount.
 */
function stubSubscribe(respond: () => Promise<Response>) {
  return () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      return url.includes(SUBSCRIBE_PATH)
        ? respond()
        : originalFetch(input, init);
    };
    return () => {
      globalThis.fetch = originalFetch;
    };
  };
}

const json = (status: number, body: unknown) => () =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  );

async function submitEmail(
  canvasElement: HTMLElement,
  email = 'artist@example.com'
) {
  const canvas = within(canvasElement);
  await userEvent.type(
    canvas.getByRole('textbox', { name: 'Email address' }),
    email
  );
  await userEvent.click(canvas.getByRole('button', { name: 'Subscribe' }));
  return canvas;
}

const meta = {
  title: 'Marketing/Changelog/ChangelogEmailSignup',
  component: ChangelogEmailSignup,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof ChangelogEmailSignup>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: the idle form before the visitor types an address. */
export const EmptyForm: Story = {};

/** The request is in flight: the field freezes and the button shows progress. */
export const LoadingSubmitting: Story = {
  beforeEach: stubSubscribe(() => new Promise<Response>(() => undefined)),
  play: async ({ canvasElement }) => {
    const canvas = await submitEmail(canvasElement);
    await expect(await canvas.findByText('Subscribing…')).toBeInTheDocument();
  },
};

/** The API rejected the address. */
export const ErrorRejectedAddress: Story = {
  beforeEach: stubSubscribe(
    json(400, { error: 'Enter a valid email address.' })
  ),
  play: async ({ canvasElement }) => {
    const canvas = await submitEmail(canvasElement, 'artist@example');
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      'Enter a valid email address.'
    );
  },
};

/** The connection dropped before the API answered. */
export const OfflineNetworkFailure: Story = {
  beforeEach: stubSubscribe(() =>
    Promise.reject(new TypeError('Failed to fetch'))
  ),
  play: async ({ canvasElement }) => {
    const canvas = await submitEmail(canvasElement);
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      'Failed to fetch'
    );
  },
};

/**
 * Partial: the subscription waits on the emailed confirmation link, with
 * resend and change-address actions.
 */
export const PartialConfirmationPending: Story = {
  beforeEach: stubSubscribe(json(200, { state: 'confirmation_required' })),
  play: async ({ canvasElement }) => {
    const canvas = await submitEmail(canvasElement);
    await expect(
      await canvas.findByRole('heading', { name: 'Check your email' })
    ).toBeInTheDocument();
  },
};

/** The address already receives the changelog. */
export const AlreadySubscribed: Story = {
  beforeEach: stubSubscribe(json(200, { state: 'subscribed' })),
  play: async ({ canvasElement }) => {
    const canvas = await submitEmail(canvasElement);
    await expect(
      await canvas.findByRole('heading', { name: 'Jovie changelog' })
    ).toBeInTheDocument();
  },
};

/** Long content: a long prefilled address and the longest caller copy. */
export const LongContentAddress: Story = {
  args: {
    initialEmail: `${'release-notes'.repeat(4)}@${'label'.repeat(8)}.example.com`,
    copy: {
      idleHeading:
        'Get every Jovie product update, release note and changelog entry by email',
      buttonLabel: 'Subscribe',
      consent:
        'One email when something ships. Unsubscribe anytime from the link in any message.',
      successHeading: 'Check your email',
      successDescription:
        'Confirm your subscription to receive Jovie changelog emails.',
      subscribedHeading: 'Jovie changelog',
      subscribedDescription: 'This email already receives the Jovie changelog.',
    },
  },
};

/** Right-to-left: Arabic copy in an Arabic document direction. */
export const RtlArabic: Story = {
  args: {
    copy: {
      idleHeading: 'احصل على التحديثات',
      buttonLabel: 'اشترك',
      consent: 'يمكنك إلغاء الاشتراك في أي وقت.',
      successHeading: 'تحقق من بريدك',
      successDescription: 'أكد اشتراكك لتلقي رسائل Jovie.',
      subscribedHeading: 'سجل تغييرات Jovie',
      subscribedDescription: 'هذا البريد مشترك بالفعل.',
    },
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
