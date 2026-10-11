export const GET_VISUAL_ACTIVITY_CHANNEL = 'desktop-get-visual-activity';
export const VISUAL_ACTIVITY_CHANNEL = 'desktop-visual-activity';

type WindowEvent = 'show' | 'hide' | 'minimize' | 'restore' | 'closed';
interface VisualWindow {
  isDestroyed(): boolean;
  isVisible(): boolean;
  isMinimized(): boolean;
  on(event: WindowEvent, listener: () => void): unknown;
  removeListener(event: WindowEvent, listener: () => void): unknown;
}
interface PowerEvents {
  on(event: 'suspend' | 'resume', listener: () => void): unknown;
  removeListener(event: 'suspend' | 'resume', listener: () => void): unknown;
}

/** Visual eligibility only: never owns streams, uploads, or update safety. */
export function observeWindowVisualActivity(
  window: VisualWindow,
  power: PowerEvents,
  publish: (active: boolean) => void
) {
  let suspended = false;
  let disposed = false;
  const read = () =>
    !disposed &&
    !suspended &&
    !window.isDestroyed() &&
    window.isVisible() &&
    !window.isMinimized();
  let previous = read();
  const update = () => {
    const active = read();
    if (disposed || active === previous) return;
    previous = active;
    publish(active);
  };
  const suspend = () => {
    suspended = true;
    update();
  };
  const resume = () => {
    suspended = false;
    update();
  };
  const events = ['show', 'hide', 'minimize', 'restore'] as const;
  const dispose = () => {
    disposed = true;
    for (const event of events) window.removeListener(event, update);
    window.removeListener('closed', dispose);
    power.removeListener('suspend', suspend);
    power.removeListener('resume', resume);
  };
  for (const event of events) window.on(event, update);
  window.on('closed', dispose);
  power.on('suspend', suspend);
  power.on('resume', resume);
  return { read, dispose };
}

export function trustedVisualActivityRequest(input: {
  readonly args: readonly unknown[];
  readonly isMainWindow: boolean;
  readonly isCurrentMainFrame: boolean;
  readonly senderUrl: string;
  readonly appOrigin: string;
}): boolean {
  if (
    input.args.length !== 0 ||
    !input.isMainWindow ||
    !input.isCurrentMainFrame
  )
    return false;
  try {
    return new URL(input.senderUrl).origin === input.appOrigin;
  } catch {
    return false;
  }
}
