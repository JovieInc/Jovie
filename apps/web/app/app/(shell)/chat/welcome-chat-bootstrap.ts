export const WELCOME_CHAT_BOOTSTRAP_RETRY_DELAYS_MS = [
  1500, 3000, 5000,
] as const;

export type WelcomeChatBootstrapState =
  | 'idle'
  | 'pending'
  | 'scheduled'
  | 'done'
  | 'failed';

export function shouldRetryWelcomeChatBootstrap(
  status: number | null
): boolean {
  return (
    status === null ||
    status === 404 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504
  );
}

export function resetWelcomeChatBootstrapState(
  stateRef: { current: WelcomeChatBootstrapState },
  retryCountRef: { current: number }
): void {
  stateRef.current = 'idle';
  retryCountRef.current = 0;
}

export function getWelcomeChatBootstrapAnnouncement(
  state: WelcomeChatBootstrapState
): string {
  switch (state) {
    case 'pending':
      return 'Starting your onboarding chat.';
    case 'scheduled':
      return 'Still setting up your onboarding chat. Retrying now.';
    case 'failed':
      return '';
    default:
      return '';
  }
}
