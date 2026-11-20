import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';
import { WaitlistRoleForm } from './WaitlistRoleForm';

type ApiMock = (request: {
  url: URL;
  init?: RequestInit;
}) => Response | Promise<Response> | undefined;
type ApiMockWindow = Window & { __jovieApiMock?: ApiMock };

const JOIN_PATH = '/api/waitlist/join';

/**
 * Stories never reach the waitlist API. The join answers through the
 * preview's `/api/*` mock seam for its own path only; every other request
 * falls through to the previous handler, which is restored after the story.
 */
function mockJoin(respond: () => Promise<Response>) {
  return () => {
    const mockWindow = window as ApiMockWindow;
    const previous = mockWindow.__jovieApiMock;
    mockWindow.__jovieApiMock = request =>
      request.url.pathname === JOIN_PATH ? respond() : previous?.(request);
    return () => {
      mockWindow.__jovieApiMock = previous;
    };
  };
}

async function requestAccess(
  canvasElement: HTMLElement,
  email: string,
  role = 'Artist'
) {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByRole('radio', { name: role }));
  await userEvent.type(canvas.getByLabelText('Email address'), email);
  await userEvent.click(canvas.getByRole('button', { name: 'Join' }));
  return canvas;
}

const meta = {
  title: 'Features/Waitlist/WaitlistRoleForm',
  component: WaitlistRoleForm,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-full max-w-md'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof WaitlistRoleForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const General: Story = { args: { variant: 'general', headingLevel: 3 } };

/** Nothing chosen or typed yet: no role is selected and the email is blank. */
export const EmptyFields: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    for (const radio of canvas.getAllByRole('radio')) {
      await expect(radio).not.toBeChecked();
    }
    await expect(canvas.getByLabelText('Email address')).toHaveValue('');
  },
};

/** The homepage chip row with no microcopy line under the field. */
export const PartialChipsWithoutNote: Story = {
  args: {
    presentation: 'chips',
    headingLevel: 2,
    title: 'Jovie opens by invitation.',
    submitLabel: 'Request invite',
  },
};

/** The request is in flight and never answers. */
export const LoadingJoin: Story = {
  beforeEach: mockJoin(() => new Promise<Response>(() => undefined)),
  play: async ({ canvasElement }) => {
    const canvas = await requestAccess(canvasElement, 'person@example.com');
    await expect(canvas.getByLabelText('Email address')).toHaveAttribute(
      'aria-busy',
      'true'
    );
  },
};

/** The server turns the request away; the typed email stays for a retry. */
export const ErrorRejected: Story = {
  beforeEach: mockJoin(async () =>
    Response.json({ error: 'Too many requests.' }, { status: 429 })
  ),
  play: async ({ canvasElement }) => {
    const canvas = await requestAccess(canvasElement, 'person@example.com');
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      'Too many requests.'
    );
    await expect(canvas.getByLabelText('Email address')).toHaveValue(
      'person@example.com'
    );
  },
};

/** The connection drops; the error says so and the input survives. */
export const OfflineJoin: Story = {
  beforeEach: mockJoin(() => Promise.reject(new TypeError('Failed to fetch'))),
  play: async ({ canvasElement }) => {
    const canvas = await requestAccess(canvasElement, 'person@example.com');
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      'Failed to fetch'
    );
    await expect(canvas.getByLabelText('Email address')).toHaveValue(
      'person@example.com'
    );
  },
};

/** A long host heading, support line and email in a narrow column. */
export const LongContent: Story = {
  args: {
    variant: 'general',
    headingLevel: 2,
    title:
      'Request access to the Jovie workspace for your management company and every artist on its roster',
    description:
      'We open to a small group at a time and read every request ourselves, so tell us who you are and where to reach you.',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      canvas.getByLabelText('Name'),
      'Alexandria Montgomery-Vanderbilt of The Extraordinarily Long Agency Name'
    );
    await userEvent.type(
      canvas.getByLabelText('Email address'),
      'alexandria.montgomery-vanderbilt@extraordinarily-long-agency-name.example.com'
    );
  },
};

/** The chip form in a right-to-left locale. */
export const Rtl: Story = {
  args: {
    presentation: 'chips',
    headingLevel: 2,
    title: 'اطلب دعوة',
    roleLabel: 'أنا',
    submitLabel: 'انضم',
    note: 'رسالة واحدة عندما تصبح دعوتك جاهزة.',
  },
  decorators: [
    Story => (
      <div dir='rtl'>
        <Story />
      </div>
    ),
  ],
};
