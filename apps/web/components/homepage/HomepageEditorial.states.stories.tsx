import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';
import { HOMEPAGE_EDITORIAL_COPY } from '@/data/homepageEditorialCopy';
import { getClaimProfileIntent } from '@/data/marketingCtaIntents';
import { HomepageInviteClose } from './HomepageEditorial';

type ApiMock = (request: {
  url: URL;
  init?: RequestInit;
}) => Response | Promise<Response> | undefined;
type ApiMockWindow = Window & { __jovieApiMock?: ApiMock };

/** Only this story's existing signup branch and join response are replaced. */
function signupFixture(closed: boolean, reject?: () => Promise<Response>) {
  return () => {
    const previousFlag = process.env.FEATURE_PUBLIC_SIGNUP_CLOSED;
    process.env.FEATURE_PUBLIC_SIGNUP_CLOSED = String(closed);
    const mockWindow = window as ApiMockWindow;
    const previousApi = mockWindow.__jovieApiMock;
    if (reject) {
      mockWindow.__jovieApiMock = request =>
        request.url.pathname === '/api/waitlist/join'
          ? reject()
          : previousApi?.(request);
    }
    return () => {
      if (previousFlag === undefined) {
        delete process.env.FEATURE_PUBLIC_SIGNUP_CLOSED;
      } else {
        process.env.FEATURE_PUBLIC_SIGNUP_CLOSED = previousFlag;
      }
      mockWindow.__jovieApiMock = previousApi;
    };
  };
}

async function assertFailedJoin(canvasElement: HTMLElement, message: string) {
  const canvas = within(canvasElement);
  const email = canvas.getByLabelText('Email address');
  const artist = canvas.getByRole('radio', { name: 'Artist' });
  await userEvent.click(artist);
  await userEvent.type(email, 'person@example.com');
  const submit = canvas.getByRole('button', {
    name: HOMEPAGE_EDITORIAL_COPY.invite.action,
  });
  await userEvent.click(submit);
  await expect(await canvas.findByRole('alert')).toHaveTextContent(message);
  await expect(email).toHaveValue('person@example.com');
  await expect(artist).toBeChecked();
  await expect(submit).toBeEnabled();
  await expect(canvas.queryByTestId('waitlist-role-form-joined')).toBeNull();
}

const meta = {
  title: 'Marketing/HomepageEditorial States',
  component: HomepageInviteClose,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof HomepageInviteClose>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The existing closed-signup fallback retains the request after rejection. */
export const ErrorClosedSignupJoin: Story = {
  beforeEach: signupFixture(true, async () =>
    Response.json({ error: 'Too many requests.' }, { status: 429 })
  ),
  play: ({ canvasElement }) =>
    assertFailedJoin(canvasElement, 'Too many requests.'),
};

/** A failed transport never displays a joined confirmation or clears input. */
export const OfflineClosedSignupJoin: Story = {
  beforeEach: signupFixture(true, () =>
    Promise.reject(new TypeError('Failed to fetch'))
  ),
  play: ({ canvasElement }) =>
    assertFailedJoin(canvasElement, 'Failed to fetch'),
};

/** Native claim entry remains editable; Chromium offline proof is separate. */
export const OfflineClaimEditing: Story = {
  beforeEach: signupFixture(false),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const handle = canvas.getByRole('textbox', {
      name: HOMEPAGE_EDITORIAL_COPY.claim.handleLabel,
    });
    await userEvent.type(handle, 'myhandle');
    await expect(handle).toHaveValue('myhandle');
    await expect(handle).toHaveFocus();
    await expect(canvas.getByTestId('homepage-claim-entry')).toHaveAttribute(
      'method',
      'get'
    );
    await expect(
      canvas.getByRole('button', { name: getClaimProfileIntent().label })
    ).toBeEnabled();
  },
};
