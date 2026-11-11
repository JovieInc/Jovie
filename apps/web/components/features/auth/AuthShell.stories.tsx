import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { APP_ROUTES } from '@/constants/routes';
import { AuthLayout } from './AuthLayout';
import { AuthShell } from './AuthShell';

const meta = {
  title: 'Auth/AuthShell',
  component: AuthShell,
  parameters: {
    layout: 'fullscreen',
    nextjs: {
      appDirectory: true,
      navigation: { pathname: '/signup' },
    },
    jovie: {
      uncoveredProps: ['compact', 'appearance'],
    },
  },
  decorators: [
    Story => (
      <AuthLayout formTitle='' showFormTitle={false} showFooterPrompt={false}>
        <Story />
      </AuthLayout>
    ),
  ],
} satisfies Meta<typeof AuthShell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SignUpSplashB: Story = {
  args: {
    mode: 'sign-up',
    suppressOneTap: true,
    forceOppositeModeHardNavigation: true,
    oppositeModeUrl: APP_ROUTES.SIGNIN,
    fallbackRedirectUrl: APP_ROUTES.START,
  },
};

export const SignIn: Story = {
  args: {
    mode: 'sign-in',
    suppressOneTap: false,
  },
};

export const ClaimTargets: Story = {
  args: { mode: 'sign-up', claimHandle: 'a'.repeat(30), suppressOneTap: true },
  parameters: {
    nextjs: {
      navigation: { pathname: '/signup', query: { handle: 'a'.repeat(30) } },
    },
  },
};

/**
 * Stories never reach Better Auth. Provider starts hit this local stand-in for
 * the same-origin `/api/auth/*` endpoint so each start state is deterministic
 * and offline; every other request passes through untouched.
 */
function stubAuthStart(respond: () => Promise<Response>) {
  return () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      return url.includes('/api/auth/')
        ? respond()
        : originalFetch(input, init);
    };
    return () => {
      globalThis.fetch = originalFetch;
    };
  };
}

async function startGoogle(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  const google = await canvas.findByRole('button', {
    name: 'Continue with Google',
  });
  await waitFor(() => expect(google).toBeEnabled());
  await userEvent.click(google);
  return canvas;
}

const signUpArgs = {
  mode: 'sign-up',
  suppressOneTap: true,
  forceOppositeModeHardNavigation: true,
  oppositeModeUrl: APP_ROUTES.SIGNIN,
} as const;

/** A provider start is in flight: every provider is disabled and the group is busy (JOV-8873). */
export const LoadingProviderStart: Story = {
  args: signUpArgs,
  beforeEach: stubAuthStart(() => new Promise<Response>(() => undefined)),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const google = await canvas.findByRole('button', {
      name: 'Continue with Google',
    });
    await waitFor(() => expect(google).toBeEnabled());
    await userEvent.click(google);
    // Optimistic pending render: the clicked provider announces the start and
    // disables while it is in flight. The storybook sandbox has no /api/auth
    // route, so the start then settles into the designed error state — assert
    // the full lifecycle: pending window, busy group, error, recovery.
    // One atomic poll: the optimistic window is a single frame.
    await waitFor(() => {
      expect(google).toBeDisabled();
      expect(google).toHaveAccessibleName('Continue with Google loading');
      expect(
        canvas.getByRole('group', { name: 'Social sign-in options' })
      ).toHaveAttribute('aria-busy', 'true');
    });
    await canvas.findByRole('alert');
    await waitFor(() => expect(google).toBeEnabled());
  },
};

/** Better Auth answered the provider start with an error. */
export const ErrorProviderStart: Story = {
  args: signUpArgs,
  beforeEach: stubAuthStart(() =>
    Promise.resolve(
      new Response(JSON.stringify({ message: 'Provider unavailable' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      })
    )
  ),
  play: async ({ canvasElement }) => {
    const canvas = await startGoogle(canvasElement);
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      'Could not start sign-up. Please try again.'
    );
  },
};

/** The network dropped before the provider start reached the server. */
export const OfflineProviderStart: Story = {
  args: { mode: 'sign-in', suppressOneTap: true },
  parameters: {
    nextjs: { appDirectory: true, navigation: { pathname: '/signin' } },
  },
  beforeEach: stubAuthStart(() =>
    Promise.reject(new TypeError('Failed to fetch'))
  ),
  play: async ({ canvasElement }) => {
    const canvas = await startGoogle(canvasElement);
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      'Could not start sign-in. Please try again.'
    );
    await expect(
      canvas.getByRole('button', { name: 'Continue with Google' })
    ).toBeEnabled();
  },
};

/** A sales-led plan handoff: the recap has a title and no price line. */
export const PartialOfferRecap: Story = {
  args: signUpArgs,
  parameters: {
    nextjs: {
      appDirectory: true,
      navigation: { pathname: '/signup', query: { plan: 'max' } },
    },
  },
};

/** A maximum-length claim handle and a long prefilled email stay inside the column. */
export const LongContent: Story = {
  args: {
    ...signUpArgs,
    claimHandle: 'a'.repeat(30),
    initialValues: {
      emailAddress: 'booking.and.management.team@example-records-group.com',
    },
  },
};

/** The shell inside a right-to-left page. */
export const Rtl: Story = {
  args: signUpArgs,
  decorators: [
    Story => (
      <div dir='rtl'>
        <Story />
      </div>
    ),
  ],
};
