import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { APP_ROUTES } from '@/constants/routes';
import { EmailCodeAuthForm } from './EmailCodeAuthForm';

const meta = {
  title: 'Auth/EmailCodeAuthForm',
  component: EmailCodeAuthForm,
  parameters: {
    layout: 'padded',
    nextjs: {
      appDirectory: true,
      navigation: { pathname: '/signup' },
    },
    jovie: {
      uncoveredProps: ['disabled'],
    },
  },
  args: {
    mode: 'sign-up',
    redirectUrl: APP_ROUTES.START,
    initialEmailAddress: 'artist@example.com',
    onOtpStepChange: () => undefined,
  },
} satisfies Meta<typeof EmailCodeAuthForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SignUpEmailStep: Story = {};

export const SignInEmailStep: Story = {
  args: {
    mode: 'sign-in',
    redirectUrl: APP_ROUTES.CHAT,
  },
};

type ApiMock = (request: {
  url: URL;
  init?: RequestInit;
}) => Response | Promise<Response> | undefined;
type ApiMockWindow = Window & { __jovieApiMock?: ApiMock };

const SEND_PATH = '/api/auth/email-otp/send-verification-otp';
const VERIFY_PATH = '/api/auth/sign-in/email-otp';

/**
 * Stories never reach Better Auth or send mail. The email-code endpoints
 * answer through the preview's `/api/*` mock seam (Better Auth pins `fetch` at
 * module init, so a swapped global could not reach it); every other request
 * falls through to the previous handler, restored after the story.
 */
function mockEmailCode(handlers: {
  readonly send?: () => Promise<Response>;
  readonly verify?: () => Promise<Response>;
}) {
  return () => {
    const mockWindow = window as ApiMockWindow;
    const previous = mockWindow.__jovieApiMock;
    mockWindow.__jovieApiMock = request => {
      if (request.url.pathname === SEND_PATH && handlers.send)
        return handlers.send();
      if (request.url.pathname === VERIFY_PATH && handlers.verify)
        return handlers.verify();
      return previous?.(request);
    };
    return () => {
      mockWindow.__jovieApiMock = previous;
    };
  };
}

const sent = async () => Response.json({ success: true });

async function sendCode(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  const send = canvas.getByRole('button', { name: 'Send sign-in code' });
  await waitFor(() => expect(send).toBeEnabled());
  await userEvent.click(send);
  return canvas;
}

async function reachCodeStep(canvasElement: HTMLElement) {
  const canvas = await sendCode(canvasElement);
  await canvas.findByTestId('otp-autofill-input');
  return canvas;
}

/** No email yet: the field is empty and the send button waits for one. */
export const EmptyEmailField: Story = {
  args: { initialEmailAddress: '' },
};

/** The code request is in flight and never answers. */
export const LoadingSendingCode: Story = {
  beforeEach: mockEmailCode({
    send: () => new Promise<Response>(() => undefined),
  }),
  play: async ({ canvasElement }) => {
    const canvas = await sendCode(canvasElement);
    await expect(
      await canvas.findByRole('button', { name: 'Sending code…' })
    ).toBeDisabled();
  },
};

/** The server refused to send a code; the email stays editable for a retry. */
export const ErrorSendRateLimited: Story = {
  beforeEach: mockEmailCode({
    send: async () =>
      Response.json({ message: 'Too many requests' }, { status: 429 }),
  }),
  play: async ({ canvasElement }) => {
    const canvas = await sendCode(canvasElement);
    await canvas.findByRole('alert');
    await expect(canvas.getByRole('textbox', { name: 'Email' })).toBeEnabled();
  },
};

/** The connection dropped before the code request reached the server. */
export const OfflineSendCode: Story = {
  beforeEach: mockEmailCode({
    send: () => Promise.reject(new TypeError('Failed to fetch')),
  }),
  play: async ({ canvasElement }) => {
    const canvas = await sendCode(canvasElement);
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      'Could not send the code. Please try again.'
    );
  },
};

/** The code step with three of six digits typed: Verify stays disabled. */
export const PartialCodeEntered: Story = {
  beforeEach: mockEmailCode({ send: sent }),
  play: async ({ canvasElement }) => {
    const canvas = await reachCodeStep(canvasElement);
    await userEvent.type(canvas.getByTestId('otp-autofill-input'), '123');
    await expect(
      canvas.getByRole('button', { name: 'Verify Code' })
    ).toBeDisabled();
  },
};

/** Five wrong codes lock the step until a new code is requested. */
export const LockedTooManyAttempts: Story = {
  beforeEach: mockEmailCode({
    send: sent,
    verify: async () =>
      Response.json(
        { code: 'TOO_MANY_ATTEMPTS', message: 'Too many attempts' },
        { status: 403 }
      ),
  }),
  play: async ({ canvasElement }) => {
    const canvas = await reachCodeStep(canvasElement);
    await userEvent.type(canvas.getByTestId('otp-autofill-input'), '111111');
    await expect(
      await canvas.findByRole('button', { name: 'Request A New Code' })
    ).toBeEnabled();
  },
};

/** A long address truncates on one line in the code step, with its full text as a title. */
export const LongContentAddress: Story = {
  args: {
    initialEmailAddress:
      'booking.and.management.team.for.the.collective@example-records-group.com',
  },
  beforeEach: mockEmailCode({ send: sent }),
  play: async ({ canvasElement }) => {
    await reachCodeStep(canvasElement);
  },
};

/** The email step inside a right-to-left page. */
export const Rtl: Story = {
  args: { align: 'left' },
  decorators: [
    Story => (
      <div dir='rtl'>
        <Story />
      </div>
    ),
  ],
};
