import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { type ReactNode, useLayoutEffect } from 'react';
import { TeleprompterStudio } from './TeleprompterStudio';

type CameraStub = 'live' | 'denied' | 'in-use';

/**
 * Storybook has no camera. A story can stand in a camera that grants a blank
 * canvas stream, or one the browser refuses, before the studio asks for it.
 */
function stubCamera(camera: CameraStub | undefined) {
  if (!camera) return;
  const getUserMedia = async (): Promise<MediaStream> => {
    if (camera === 'denied')
      throw new DOMException('Permission denied', 'NotAllowedError');
    if (camera === 'in-use')
      throw new DOMException('Camera in use', 'NotReadableError');
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 9;
    return canvas.captureStream();
  };
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia,
      enumerateDevices: async () => [],
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    },
  });
}

/** The studio portals to the body, so right-to-left is set on the document. */
function DocumentDirectionRtl({ children }: { readonly children: ReactNode }) {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const previous = root.getAttribute('dir');
    root.setAttribute('dir', 'rtl');
    return () => {
      if (previous === null) root.removeAttribute('dir');
      else root.setAttribute('dir', previous);
    };
  }, []);
  return <>{children}</>;
}

const LONG_SCRIPT = Array.from(
  { length: 10 },
  () =>
    "It's release day. Save the Night is out everywhere, and I made it for the late drives home when the city goes quiet."
).join(' ');

const meta = {
  title: 'Features/TeleprompterStudio/TeleprompterStudio',
  component: TeleprompterStudio,
  parameters: { layout: 'fullscreen', themes: { themeOverride: 'dark' } },
  decorators: [
    (Story, { parameters }) => {
      stubCamera(parameters.camera as CameraStub | undefined);
      return <Story />;
    },
  ],
  args: {
    context: {
      profileId: 'profile-story',
      kind: 'promo',
      title: 'Release day shout-out',
      script:
        "It's release day. Save the Night is out everywhere, and I made it for the late drives home.",
      showcaseVariant: 'direct',
      source: 'chat_proposal',
      questions: ['What were you feeling the night you wrote it?'],
    },
    onClose: () => {},
  },
} satisfies Meta<typeof TeleprompterStudio>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NoCamera: Story = {};
export const Live: Story = { parameters: { camera: 'live' } };
export const PermissionDeniedCamera: Story = {
  parameters: { camera: 'denied' },
};
export const ErrorCameraInUse: Story = { parameters: { camera: 'in-use' } };
export const LongScript: Story = {
  parameters: { camera: 'live' },
  args: {
    context: {
      profileId: 'profile-story',
      kind: 'promo',
      title:
        'Release day shout-out for Save the Night, the extended club mix with the live strings and the new spoken intro',
      script: LONG_SCRIPT,
      showcaseVariant: 'direct',
      source: 'chat_proposal',
      questions: ['What were you feeling the night you wrote it?'],
    },
  },
};
export const Rtl: Story = {
  parameters: { camera: 'live' },
  render: args => (
    <DocumentDirectionRtl>
      <TeleprompterStudio {...args} />
    </DocumentDirectionRtl>
  ),
};
