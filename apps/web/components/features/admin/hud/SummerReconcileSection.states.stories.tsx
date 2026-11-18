import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';
import { SummerReconcileSection } from './SummerReconcileSection';

const RECONCILE_PATH = '/api/ovie/summer/reconcile';

/** Answers the reconcile request for one story; nothing reaches the API. */
function stubReconcile(answer: () => Promise<Response>) {
  return () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input), window.location.href);
      if (url.pathname === RECONCILE_PATH) return answer();
      return originalFetch(input, init);
    };
    return () => {
      globalThis.fetch = originalFetch;
    };
  };
}

async function requestReconcile(canvasElement: HTMLElement) {
  await userEvent.click(
    within(canvasElement).getByTestId('summer-reconcile-request')
  );
}

const meta = {
  title: 'Features/Admin/Hud/SummerReconcileSection States',
  component: SummerReconcileSection,
  parameters: { layout: 'padded' },
  args: { indicated: true },
} satisfies Meta<typeof SummerReconcileSection>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: no recovery is indicated, so the section stays read-only. */
export const EmptyNoRecoveryIndicated: Story = { args: { indicated: false } };

/** Loading: the request is in flight and the button is disabled. */
export const LoadingRequesting: Story = {
  beforeEach: stubReconcile(() => new Promise<Response>(() => {})),
  play: async ({ canvasElement }) => {
    await requestReconcile(canvasElement);
    await expect(
      within(canvasElement).getByTestId('summer-reconcile-request')
    ).toBeDisabled();
  },
};

/** Error: the server denies the recovery and the reason is shown. */
export const ErrorFounderAccessDenied: Story = {
  beforeEach: stubReconcile(async () =>
    Response.json(
      { ok: false, code: 'founder_access_required' },
      { status: 403 }
    )
  ),
  play: async ({ canvasElement }) => {
    await requestReconcile(canvasElement);
    await expect(
      await within(canvasElement).findByTestId('summer-reconcile-denial')
    ).toHaveTextContent('founder access is required');
  },
};

/** Partial: a persisted receipt whose event id the server did not return. */
export const PartialReceiptWithoutEventId: Story = {
  beforeEach: stubReconcile(async () =>
    Response.json({ ok: true, persisted: 'existing' })
  ),
  play: async ({ canvasElement }) => {
    await requestReconcile(canvasElement);
    await expect(
      await within(canvasElement).findByTestId('summer-reconcile-receipt')
    ).toHaveTextContent('Already recorded');
  },
};

/** Offline: the endpoint is unreachable from the browser. */
export const OfflineEndpointUnreachable: Story = {
  beforeEach: stubReconcile(async () => {
    throw new TypeError('Failed to fetch');
  }),
  play: async ({ canvasElement }) => {
    await requestReconcile(canvasElement);
    await expect(
      await within(canvasElement).findByTestId('summer-reconcile-denial')
    ).toHaveTextContent('the recovery endpoint was unreachable');
  },
};

function NarrowSection(args: { readonly indicated: boolean }) {
  return (
    <div className='w-72'>
      <SummerReconcileSection {...args} />
    </div>
  );
}

/** Long content: an unmapped, very long denial code in a narrow drawer. */
export const LongContentUnmappedDenialCode: Story = {
  beforeEach: stubReconcile(async () =>
    Response.json(
      {
        ok: false,
        code: 'summer_result_binding_drift_detected_after_deployment_pin_rotation_and_receipt_replay',
      },
      { status: 409 }
    )
  ),
  render: NarrowSection,
  play: async ({ canvasElement }) => {
    await requestReconcile(canvasElement);
    await expect(
      await within(canvasElement).findByTestId('summer-reconcile-denial')
    ).toHaveTextContent('Recovery denied (');
  },
};

function RtlSection(args: { readonly indicated: boolean }) {
  return (
    <div dir='rtl' lang='ar' className='w-72'>
      <SummerReconcileSection {...args} />
    </div>
  );
}

/** RTL: the section and its recorded receipt in a right-to-left container. */
export const RtlRecordedReceipt: Story = {
  beforeEach: stubReconcile(async () =>
    Response.json({
      ok: true,
      persisted: 'created',
      result: { eventId: 'evt-123' },
    })
  ),
  render: RtlSection,
  play: async ({ canvasElement }) => {
    await requestReconcile(canvasElement);
    await expect(
      await within(canvasElement).findByTestId('summer-reconcile-receipt')
    ).toHaveTextContent('evt-123');
  },
};
